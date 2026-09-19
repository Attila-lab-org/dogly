"""Shared personal-fact provenance for DOGly Canine Intelligence."""

from __future__ import annotations

from typing import Literal

PersonalFactProvenance = Literal[
    "OBSERVED",
    "OWNER_REPORTED",
    "OWNER_CONFIRMED",
    "IMPORTED",
    "INFERRED",
    "ESTABLISHED_PATTERN",
]

PROVENANCE_ALIASES: dict[str, PersonalFactProvenance] = {
    "OBSERVED": "OBSERVED",
    "DOGLY_OBSERVED": "OBSERVED",
    "OWNER_REPORTED": "OWNER_REPORTED",
    "OWNER_CONFIRMED": "OWNER_CONFIRMED",
    "IMPORTED": "IMPORTED",
    "INFERRED": "INFERRED",
    "SYSTEM_INFERRED": "INFERRED",
    "DERIVED": "INFERRED",
    "ESTABLISHED_PATTERN": "ESTABLISHED_PATTERN",
    "VET_RECORDED": "IMPORTED",
}

PROVENANCE_OWNER_LABEL: dict[PersonalFactProvenance, str] = {
    "OBSERVED": "osservato",
    "OWNER_REPORTED": "raccontato",
    "OWNER_CONFIRMED": "raccontato",
    "IMPORTED": "importato",
    "INFERRED": "inferito",
    "ESTABLISHED_PATTERN": "imparato",
}


def normalize_provenance(raw: str | None) -> PersonalFactProvenance:
    if not raw:
        return "OWNER_REPORTED"
    return PROVENANCE_ALIASES.get(str(raw).strip().upper(), "OWNER_REPORTED")
