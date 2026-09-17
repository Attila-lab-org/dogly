"""Normalize dog sex to values accepted by dogs_sex_check."""

from __future__ import annotations

_CANONICAL = frozenset({"MALE", "FEMALE", "UNKNOWN"})
_ALIASES = {
    "M": "MALE",
    "MALE": "MALE",
    "MASCHIO": "MALE",
    "F": "FEMALE",
    "FEMALE": "FEMALE",
    "FEMMINA": "FEMALE",
    "UNKNOWN": "UNKNOWN",
    "SCONOSCIUTO": "UNKNOWN",
    "NONSO": "UNKNOWN",
    "NONLOSO": "UNKNOWN",
}


def normalize_sex(value: str | None) -> str | None:
    if value is None:
        return None
    raw = " ".join(value.strip().split())
    if not raw:
        return None
    mapped = _ALIASES.get(raw.upper().replace(" ", ""))
    if mapped:
        return mapped
    if raw.upper() in _CANONICAL:
        return raw.upper()
    return "UNKNOWN"
