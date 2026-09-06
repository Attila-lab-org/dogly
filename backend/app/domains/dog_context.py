"""Compact dog context assembly for the reasoner and Advice Engine."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from app.domains.models import DogRec
from app.knowledge.models import (
    DogContextSnapshot,
    LifeStageContext,
    LifestyleFact,
)


def _age_months(birth_date: str | None, today: date | None = None) -> int | None:
    if not birth_date:
        return None
    try:
        born = date.fromisoformat(birth_date)
    except ValueError:
        return None
    current = today or datetime.now(UTC).date()
    if born > current:
        return None
    months = (current.year - born.year) * 12 + current.month - born.month
    return max(0, months - (1 if current.day < born.day else 0))


def derive_life_stage(dog: DogRec, today: date | None = None) -> tuple[int | None, LifeStageContext]:
    months = _age_months(dog.birth_date, today)
    if months is not None:
        senior_months = {
            "GIANT": 72,
            "LARGE": 84,
            "MEDIUM": 96,
            "SMALL": 120,
            "TOY": 120,
        }.get((dog.size or "").upper(), 96)
        value = (
            "PUPPY"
            if months < 9
            else "YOUNG_ADULT"
            if months < 48
            else "SENIOR"
            if months >= senior_months
            else "MATURE_ADULT"
        )
        return months, LifeStageContext(value=value, source="DERIVED", confidence="MEDIUM")

    fallback = {
        "PUPPY": "PUPPY",
        "ADOLESCENT": "YOUNG_ADULT",
        "ADULT": "MATURE_ADULT",
        "SENIOR": "SENIOR",
    }.get((dog.age_stage or "").upper())
    if fallback:
        return None, LifeStageContext(value=fallback, source="PROFILE", confidence="LOW")
    return None, LifeStageContext(value="UNKNOWN", source="UNKNOWN", confidence="LOW")


def _facts(
    values: dict[str, Any],
    provenance: dict[str, str],
    last_confirmed_at: datetime | None,
) -> list[LifestyleFact]:
    return [
        LifestyleFact(
            key=key,
            value=value,
            provenance=provenance.get(key, "OWNER_REPORTED"),
            last_confirmed_at=last_confirmed_at,
        )
        for key, value in values.items()
        if value is not None
    ]


def build_dog_context(dog: DogRec, lifestyle: dict[str, Any] | None = None) -> DogContextSnapshot:
    lifestyle = lifestyle or {}
    routine_raw = dict(lifestyle.get("routine") or {})
    preferences_raw = dict(lifestyle.get("preferences") or {})
    provenance = dict(lifestyle.get("provenance") or {})
    confirmed = lifestyle.get("last_confirmed_at")
    if isinstance(confirmed, str):
        confirmed = datetime.fromisoformat(confirmed)

    today_vs_usual = dict(routine_raw.pop("today_vs_usual", {}) or {})
    recent_changes = dict(routine_raw.pop("recent_changes", {}) or {})
    health_context = dict(routine_raw.pop("health_context", {}) or {})
    routine = {
        fact.key: fact
        for fact in _facts(routine_raw, provenance, confirmed)
    }
    age_months, life_stage = derive_life_stage(dog)
    return DogContextSnapshot(
        dog_id=dog.id,
        age_months=age_months,
        life_stage=life_stage,
        size=dog.size,
        breed_label=dog.breed_label,
        is_mix=dog.is_mix,
        routine=routine,
        today_vs_usual=_facts(today_vs_usual, provenance, confirmed),
        recent_changes=_facts(recent_changes, provenance, confirmed),
        preferences=_facts(preferences_raw, provenance, confirmed),
        health_context=_facts(health_context, provenance, confirmed),
    )
