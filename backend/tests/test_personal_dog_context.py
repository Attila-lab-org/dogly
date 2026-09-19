"""Tests for PersonalDogContext assembly and provenance."""

from __future__ import annotations

from datetime import UTC, datetime

from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec
from app.domains.personal_dog_context import (
    assemble_behavior_dog_context,
    build_personal_dog_context,
    merge_owner_stories_into_context,
    personal_to_stable_facts,
)
from app.contracts.canine_intelligence import CanineEvidenceItem
from app.contracts.provenance import normalize_provenance
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
