"""Gating for sensitive visual anomaly candidates.

`possible` is an observation, not a consumer warning. A focused second model
call is not required: deterministic corroboration decides whether a candidate
may enter safety. `clear_candidate` is never lowered.
"""

from __future__ import annotations

from typing import Any

SENSITIVE_CANDIDATES = (
    "fresh_blood_candidate",
    "melena_candidate",
    "foreign_material_candidate",
    "mucus_candidate",
)

# Blood/melena may escalate on a corroborated possible. Foreign material and
# mucus need a clear visual candidate before they change the consumer result.
_POSSIBLE_MAY_ESCALATE = {
    "fresh_blood_candidate",
    "melena_candidate",
}


def _level(observation: dict[str, Any], field: str) -> str:
    return str(observation.get(field) or "unknown").lower()


def gate_candidate(
    observation: dict[str, Any],
    field: str,
) -> str:
    level = _level(observation, field)
    if level == "clear_candidate":
        return "clear_candidate"
    if level == "none_observed":
        return "none_observed"
    if level != "possible":
        return "unknown"
    if str(observation.get("image_quality") or "").lower() != "sufficient":
        return "unknown"
    if field not in _POSSIBLE_MAY_ESCALATE:
        return "possible_unverified"
    confidence = str(observation.get("confidence_band") or "LOW").upper()
    if confidence == "LOW":
        return "possible_unverified"
    return "possible"


def verify_anomaly_candidates(observation: dict[str, Any]) -> dict[str, str]:
    """Return safety-facing candidate levels. Never downgrades clear evidence."""

    return {field: gate_candidate(observation, field) for field in SENSITIVE_CANDIDATES}


def safety_candidate(observation: dict[str, Any], field: str) -> str:
    gated = (observation.get("safety_candidates") or {}).get(field)
    if gated:
        return str(gated).lower()
    return gate_candidate(observation, field)
