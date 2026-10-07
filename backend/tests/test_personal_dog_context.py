"""Tests for PersonalDogContext assembly and provenance."""

from __future__ import annotations

from datetime import UTC, datetime

from app.contracts.canine_intelligence import CanineEvidenceItem
from app.contracts.provenance import normalize_provenance
from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec, FoodProductRec
from app.domains.personal_dog_context import (
    assemble_behavior_dog_context,
    build_personal_dog_context,
    load_cross_domain_evidence_memory,
    merge_owner_stories_into_context,
    personal_to_stable_facts,
)
from app.domains.realtime_context import realtime_context_from_personal
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


def test_realtime_evidence_selection_keeps_care_event() -> None:
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

    assert [item.source_id for item in context.items] == ["c1"]
