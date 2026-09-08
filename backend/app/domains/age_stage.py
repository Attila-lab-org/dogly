"""Normalize dog age_stage to values accepted by dogs_age_stage_check."""

from __future__ import annotations

import re

from app.knowledge.models import LifeStageContext

_CANONICAL = frozenset({"PUPPY", "ADOLESCENT", "ADULT", "SENIOR", "UNKNOWN"})
_ITALIAN_YEARS = re.compile(r"^(Meno di 1 anno|[0-9]+ anno|[0-9]+ anni)$")
_DISPLAY_IT = {
    "CUCCIOLO": "PUPPY",
    "GIOVANE": "ADOLESCENT",
    "ADOLESCENTE": "ADOLESCENT",
    "ADULTO": "ADULT",
    "ANZIANO": "SENIOR",
}


def normalize_age_stage(value: str | None) -> str:
    if value is None:
        return "UNKNOWN"
    raw = " ".join(value.strip().split())
    if not raw:
        return "UNKNOWN"
    upper = raw.upper()
    if upper in _CANONICAL:
        return upper
    mapped = _DISPLAY_IT.get(upper)
    if mapped:
        return mapped
    if _ITALIAN_YEARS.match(raw):
        return raw
    return "UNKNOWN"


def years_from_age_stage(value: str | None) -> int | None:
    raw = " ".join((value or "").strip().split())
    if not raw:
        return None
    if raw.lower().startswith("meno di 1"):
        return 0
    match = re.fullmatch(r"([0-9]+) anni?", raw)
    if match:
        return int(match.group(1))
    return None


def profile_life_stage(age_stage: str | None) -> str | None:
    canonical = normalize_age_stage(age_stage)
    fallback = {
        "PUPPY": "PUPPY",
        "ADOLESCENT": "YOUNG_ADULT",
        "ADULT": "MATURE_ADULT",
        "SENIOR": "SENIOR",
    }.get(canonical)
    if fallback:
        return fallback
    years = years_from_age_stage(canonical)
    if years is None:
        return None
    if years < 1:
        return "PUPPY"
    if years < 2:
        return "YOUNG_ADULT"
    if years < 8:
        return "MATURE_ADULT"
    return "SENIOR"


def profile_life_stage_context(age_stage: str | None) -> LifeStageContext:
    value = profile_life_stage(age_stage)
    if not value:
        return LifeStageContext(value="UNKNOWN", source="UNKNOWN", confidence="LOW")
    return LifeStageContext(value=value, source="PROFILE", confidence="LOW")
