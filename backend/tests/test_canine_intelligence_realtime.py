"""Cross-domain Canine Intelligence realtime regression tests."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.config import Settings
from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec
from app.domains.realtime_context import (
    RealtimeContextItem,
    RealtimeDogContext,
    _breed_intelligence_payload,
    render_voice_brief,
)
from app.domains.realtime_orchestrator import orchestrate_realtime_turn


def test_free_chat_receives_breed_prior_but_mixes_do_not_get_one() -> None:
    settings = Settings(breed_intelligence_v1=True)
    named = DogRec(
        id="dog-1",
        owner_id="owner-1",
        name="Oreo",
        breed_label="Border Collie",
        created_at=datetime.now(UTC),
    )
    named_payload = _breed_intelligence_payload(
        named,
        build_dog_context(named),
        ["BEHAVIOR"],
        settings=settings,
    )
    assert named_payload["BEHAVIOR"]["functional_group"] == "HERDING"

    mixed = named.model_copy(update={"breed_label": "Meticcio", "is_mix": True})
    mixed_payload = _breed_intelligence_payload(
        mixed,
        build_dog_context(mixed),
        ["BEHAVIOR"],
        settings=settings,
    )
    assert mixed_payload["BEHAVIOR"]["functional_group"] is None


def _welcome(owner: str, dog: str) -> str:
    first = owner.strip().split(" ", 1)[0].capitalize()
    return f"Ciao {first}, sono qui per te e {dog}. Cosa vuoi capire oggi?"


@pytest.mark.asyncio
async def test_food_change_soft_stool_uses_cross_domain_governance() -> None:
    settings = Settings(realtime_enabled=False)
    context = RealtimeDogContext(
        dog_id="dog-1",
        dog_name="Oreo",
        owner_display_name="Attilio",
        identity={"breed_label": "Meticcio"},
        stable_facts=[
            {
                "statement": "Cambio cibo recente",
                "provenance": "OWNER_CONFIRMED",
                "owner_label": "raccontato",
            }
        ],
        items=[
            RealtimeContextItem(
                source_id="feed-1",
                source_type="FEEDING_PERIOD",
                summary="Alimentazione attiva: Pro Plan",
                data={"owner_label": "raccontato"},
            ),
            RealtimeContextItem(
                source_id="fec-1",
                source_type="DIGESTIVE_EVENT",
                summary="Feci molli nelle ultime letture",
                data={"owner_label": "osservato", "headline": "Feci molli"},
            ),
        ],
    )
    decision, audit = await orchestrate_realtime_turn(
        settings=settings,
        user_text="Da quando ho cambiato cibo fa spesso la cacca molle",
        domains=["DIGESTIVE", "NUTRITION"],
        context=context,
        history=[],
    )
    assert "DIGESTIVE" in decision.domains
    assert "NUTRITION" in decision.domains
    assert "non dimostra che sia quella la causa" in decision.assistant_text.lower()
    assert decision.claims[0].asserts_causation is False
    assert "canine_intelligence" in audit
    assert audit["canine_intelligence"]["validations"]


def test_voice_brief_labels_observed_reported_learned() -> None:
    brief = render_voice_brief(
        RealtimeDogContext(
            dog_id="dog-1",
            dog_name="Oreo",
            owner_display_name="Attilio",
            identity={"breed_label": "Meticcio", "age_stage": "ADULT"},
            stable_facts=[
                {
                    "statement": "Preferisce passeggiare la sera",
                    "provenance": "OWNER_CONFIRMED",
                    "owner_label": "raccontato",
                }
            ],
            items=[
                RealtimeContextItem(
                    source_id="fec-1",
                    source_type="DIGESTIVE_EVENT",
                    summary="Digestione stabile",
                    data={
                        "headline": "Oreo sta digerendo bene",
                        "owner_label": "osservato",
                    },
                )
            ],
        ),
        welcome=_welcome("attilio", "Oreo"),
    )
    assert "[raccontato]" in brief
    assert "osservato" in brief
