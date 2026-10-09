"""Tests for PersonalDogContext assembly and provenance."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import httpx
import pytest

from app.config import Settings
from app.contracts.canine_intelligence import CanineEvidenceItem
from app.contracts.provenance import normalize_provenance
from app.domains import realtime_orchestrator
from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec, FeedingPeriodRec, FoodProductRec
from app.domains.personal_dog_context import (
    assemble_behavior_dog_context,
    build_personal_dog_context,
    load_cross_domain_evidence_memory,
    merge_owner_stories_into_context,
    personal_to_stable_facts,
)
from app.domains.realtime_context import (
    realtime_context_from_personal,
    route_realtime_domains,
)
from app.domains.repository import InMemoryStore
from app.knowledge.models import LifestyleFact


def _dog() -> DogRec:
    return DogRec(
        id="dog-1",
        owner_id="user-1",
        name="Oreo",
        created_at=datetime.now(UTC),
        weight_kg=12.0,
        age_stage="ADULT",
        breed_label="Meticcio",
    )


def test_normalize_provenance_aliases() -> None:
    assert normalize_provenance("DOGLY_OBSERVED") == "OBSERVED"
    assert normalize_provenance("OWNER_CONFIRMED") == "OWNER_CONFIRMED"
    assert normalize_provenance("weird") == "OWNER_REPORTED"


def test_merge_owner_stories_dedupes_into_personal_facts() -> None:
    dog = _dog()
    base = build_dog_context(
        dog,
        {
            "routine": {"walks": "2"},
            "provenance": {"walks": "OWNER_REPORTED"},
        },
        owner_display_name="Attilio",
    )
    stories = [
        {
            "id": "s1",
            "confirmed_at": datetime.now(UTC),
            "facts": [
                {
                    "statement": "Da quando ho cambiato cibo fa spesso la cacca molle",
                    "category": "DIET",
                }
            ],
        }
    ]
    context, personal = assemble_behavior_dog_context(
        dog,
        {
            "routine": {"walks": "2"},
            "provenance": {"walks": "OWNER_REPORTED"},
        },
        stories,
        owner_display_name="Attilio",
    )
    assert any("cacca molle" in str(item.value) for item in context.health_context)
    assert personal.dog_name == "Oreo"
    assert any(fact.provenance == "OWNER_CONFIRMED" for fact in personal.personal_facts)
    labels = {fact["owner_label"] for fact in personal_to_stable_facts(personal)}
    assert "raccontato" in labels
    # second merge does not explode or duplicate endlessly
    again = merge_owner_stories_into_context(base, stories)
    personal2 = build_personal_dog_context(
        dog=dog,
        dog_context=again,
        stories=stories,
        owner_display_name="Attilio",
    )
    diet_facts = [f for f in personal2.personal_facts if f.key == "owner_diet"]
    assert len(diet_facts) == 1


def test_cross_domain_evidence_keeps_provenance() -> None:
    dog = _dog()
    base = build_dog_context(dog, {})
    evidence = [
        CanineEvidenceItem(
            evidence_id="feeding_period:fp1",
            domain="NUTRITION",
            source_type="FEEDING_PERIOD",
            source_id="fp1",
            occurred_at=datetime.now(UTC),
            provenance="OWNER_CONFIRMED",
            verification="VERIFIED",
            summary="Alimentazione attiva: Pro Plan",
            data={},
        ),
        CanineEvidenceItem(
            evidence_id="digestive_event:fe1",
            domain="DIGESTIVE",
            source_type="DIGESTIVE_EVENT",
            source_id="fe1",
            occurred_at=datetime.now(UTC),
            provenance="OBSERVED",
            verification="VERIFIED",
            summary="Feci molli",
            data={},
        ),
    ]
    personal = build_personal_dog_context(
        dog=dog,
        dog_context=base,
        evidence=evidence,
    )
    assert "active_feeding" not in personal.missing
    assert "fe1" in personal.evidence_ids()
    assert "fp1" in personal.evidence_ids()


def test_realtime_core_keeps_saved_feeding_quantity() -> None:
    dog = _dog()
    base = build_dog_context(dog, {})
    personal = build_personal_dog_context(
        dog=dog,
        dog_context=base,
        evidence=[
            CanineEvidenceItem(
                evidence_id="feeding_period:fp-quantity",
                domain="NUTRITION",
                source_type="FEEDING_PERIOD",
                source_id="fp-quantity",
                occurred_at=datetime.now(UTC),
                provenance="OWNER_CONFIRMED",
                verification="VERIFIED",
                summary="Alimentazione attiva: Monge Salmon with Rice",
                data={"quantity_per_day": "200 g", "end_at": None},
            )
        ],
    )

    context = realtime_context_from_personal(
        personal, domains=["NUTRITION"], user_text="Quanti grammi mangia Oreo?"
    )

    active = next(item for item in context.core_facts if item["key"] == "active_feeding")
    assert active["quantity_per_day"] == "200 g"
    assert active["domain"] == "NUTRITION"


def test_lifestyle_fact_accepts_legacy_provenance() -> None:
    fact = LifestyleFact(key="walks", value="2", provenance="SYSTEM_INFERRED")
    assert fact.provenance == "INFERRED"


def test_unlinked_catalog_food_is_not_personal_dog_context() -> None:
    store = InMemoryStore()
    dog = _dog()
    store.dogs[dog.id] = dog
    store.food_products["catalog-1"] = FoodProductRec(
        id="catalog-1",
        owner_id=dog.owner_id,
        dog_id=dog.id,
        client_request_id="catalog-1",
        name="Cibo solo salvato",
        created_at=datetime.now(UTC),
    )

    evidence = load_cross_domain_evidence_memory(
        store, dog_id=dog.id, domains=["GENERAL"]
    )

    assert all(item.source_type != "FOOD_PRODUCT" for item in evidence)


def test_stable_facts_are_independent_of_turn_wording() -> None:
    dog = _dog()
    base = build_dog_context(dog, {})
    stories = [
        {
            "id": "s-routine",
            "confirmed_at": datetime.now(UTC),
            "facts": [{"statement": "Oreo dorme sul divano", "category": "ROUTINE"}],
        },
        {
            "id": "s-food",
            "confirmed_at": datetime.now(UTC),
            "facts": [{"statement": "Oreo mangia lentamente", "category": "DIET"}],
        },
    ]
    personal = build_personal_dog_context(
        dog=dog, dog_context=base, stories=stories
    )

    selected = personal_to_stable_facts(
        personal, user_text="Oreo mangia lentamente?", domains=["NUTRITION"]
    )
    equivalent = personal_to_stable_facts(
        personal, user_text="Quale routine alimentare ha Oreo?", domains=["BEHAVIOR"]
    )
    assert [fact["source_id"] for fact in selected] == [
        fact["source_id"] for fact in equivalent
    ]


def test_realtime_evidence_selection_keeps_only_relevant_domain_items() -> None:
    dog = _dog()
    base = build_dog_context(dog, {})
    evidence = [
        CanineEvidenceItem(
            evidence_id="behavior:b1",
            domain="BEHAVIOR",
            source_type="BEHAVIOR_EVENT",
            source_id="b1",
            occurred_at=datetime(2026, 1, 3, tzinfo=UTC),
            provenance="OBSERVED",
            summary="Abbaio osservato",
        ),
        CanineEvidenceItem(
            evidence_id="digestive:d1",
            domain="DIGESTIVE",
            source_type="DIGESTIVE_EVENT",
            source_id="d1",
            occurred_at=datetime(2026, 1, 2, tzinfo=UTC),
            provenance="OBSERVED",
            summary="Feci osservate",
        ),
        CanineEvidenceItem(
            evidence_id="care:c1",
            domain="CARE",
            source_type="CARE_EVENT",
            source_id="c1",
            occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
            provenance="OWNER_REPORTED",
            summary="Visita passata",
        ),
    ]
    personal = build_personal_dog_context(
        dog=dog, dog_context=base, evidence=evidence
    )

    context = realtime_context_from_personal(
        personal, user_text="Perché abbaia?", domains=["BEHAVIOR"]
    )

    assert [item.source_id for item in context.items] == ["b1"]


def test_realtime_evidence_selection_excludes_recent_irrelevant_event() -> None:
    dog = _dog()
    evidence = [
        CanineEvidenceItem(
            evidence_id="behavior:relevant",
            domain="BEHAVIOR",
            source_type="BEHAVIOR_EVENT",
            source_id="relevant",
            occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
            provenance="OBSERVED",
            summary="Abbaio osservato durante la passeggiata",
        ),
        CanineEvidenceItem(
            evidence_id="digestive:recent",
            domain="DIGESTIVE",
            source_type="DIGESTIVE_EVENT",
            source_id="recent",
            occurred_at=datetime(2026, 1, 10, tzinfo=UTC),
            provenance="OBSERVED",
            summary="Feci formate nella mattina",
        ),
    ]
    personal = build_personal_dog_context(
        dog=dog, dog_context=build_dog_context(dog, {}), evidence=evidence
    )

    context = realtime_context_from_personal(
        personal, user_text="Cosa significa quando abbaia?", domains=["BEHAVIOR"]
    )

    assert [item.source_id for item in context.items] == ["relevant"]


def test_realtime_evidence_selection_returns_empty_for_unrelated_general_turn() -> None:
    dog = _dog()
    personal = build_personal_dog_context(
        dog=dog,
        dog_context=build_dog_context(dog, {}),
        evidence=[
            CanineEvidenceItem(
                evidence_id="behavior:b1",
                domain="BEHAVIOR",
                source_type="BEHAVIOR_EVENT",
                source_id="b1",
                occurred_at=datetime(2026, 1, 3, tzinfo=UTC),
                provenance="OBSERVED",
                summary="Abbaio osservato durante la passeggiata",
            )
        ],
    )

    outside = realtime_context_from_personal(
        personal, user_text="Fuori piove", domains=["GENERAL"]
    )
    mood = realtime_context_from_personal(
        personal, user_text="Oggi è felicissimo", domains=["GENERAL"]
    )

    assert outside.items == []
    assert mood.items == []


def test_realtime_evidence_selection_is_empty_without_relevance() -> None:
    dog = _dog()
    personal = build_personal_dog_context(
        dog=dog,
        dog_context=build_dog_context(dog, {}),
        evidence=[
            CanineEvidenceItem(
                evidence_id="care:c1",
                domain="CARE",
                source_type="CARE_EVENT",
                source_id="c1",
                occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
                provenance="OWNER_REPORTED",
                summary="Visita veterinaria",
            )
        ],
    )

    context = realtime_context_from_personal(
        personal, user_text="Qual è la situazione?", domains=["GENERAL"]
    )

    assert context.items == []


def test_realtime_context_keeps_core_but_gates_stable_facts_by_turn_domain() -> None:
    dog = _dog()
    personal = build_personal_dog_context(
        dog=dog,
        dog_context=build_dog_context(dog, {}),
        stories=[
            {
                "id": "story-food",
                "confirmed_at": datetime.now(UTC),
                "facts": [{"statement": "Oreo mangia pollo e riso", "category": "DIET"}],
            }
        ],
    )

    weather = realtime_context_from_personal(
        personal, user_text="Oggi piove", domains=["GENERAL"]
    )
    food = realtime_context_from_personal(
        personal, user_text="Che cibo mangia Oreo?", domains=["NUTRITION"]
    )

    assert any("pollo" in str(fact.get("value")) for fact in weather.core_facts)
    assert weather.stable_facts == []
    assert any("pollo" in str(fact.get("value")) for fact in food.core_facts)


@pytest.mark.asyncio
@pytest.mark.parametrize("quantity", ["200 g", None])
async def test_saved_quantity_reaches_provider_without_old_ration(monkeypatch, quantity):
    store = InMemoryStore()
    dog = _dog()
    now = datetime.now(UTC)
    store.food_products["food"] = FoodProductRec(
        id="food", owner_id=dog.owner_id, dog_id=dog.id,
        client_request_id="food", name="Cibo attuale", created_at=now,
    )
    for period_id, amount, end in [("old", "300 g", now), ("current", quantity, None)]:
        store.feeding_periods[period_id] = FeedingPeriodRec(
            id=period_id, dog_id=dog.id, food_product_id="food",
            start_at=now, end_at=end, quantity_per_day=amount,
        )
    question = "Quanti grammi mangia Oreo?"
    domains = route_realtime_domains(question)
    personal = build_personal_dog_context(
        dog=dog, dog_context=build_dog_context(dog, {}),
        evidence=load_cross_domain_evidence_memory(store, dog_id=dog.id, domains=domains),
    )
    context = realtime_context_from_personal(personal, domains=domains, user_text=question)
    captured = []

    def respond(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({
            "assistant_text": "Risposta simulata per verificare il trasporto.",
            "action_type": "none", "action_options": [], "action_prompt": None,
            "used_source_ids": [],
        })}}]})

    client_type = httpx.AsyncClient
    monkeypatch.setattr(
        realtime_orchestrator.httpx, "AsyncClient",
        lambda **kwargs: client_type(transport=httpx.MockTransport(respond), **kwargs),
    )
    history = [{"role": "user", "content": "Oggi piove"},
               {"role": "assistant", "content": "Giornata di pioggia, quindi."}]
    await realtime_orchestrator.orchestrate_realtime_turn(
        settings=Settings(realtime_enabled=True, openai_api_key="test-only",
                          ai_kill_switch=False, realtime_kill_switch=False),
        user_text=question, domains=domains, context=context, history=history,
    )
    assert len(captured) == 1
    payload = json.loads(captured[0]["messages"][1]["content"].split("\n", 1)[1])
    assert payload["conversation"] == history
    assert payload["owner_turn"] == question
    active = [fact for fact in payload["personal_dog_context"]["core_facts"]
              if fact["key"] == "active_feeding"]
    assert len(active) == 1
    assert active[0]["source_id"] == "current"
    assert active[0]["quantity_per_day"] == quantity
