"""Gating for sensitive visual anomaly candidates.

`possible` from the first Observer is not corroboration. Fresh blood and
melena may enter safety only after a focused verification verdict of
`confirmed`. `clear_candidate` is never lowered. Foreign material and mucus
still need a clear visual candidate before they change the consumer result.
"""

from __future__ import annotations

from typing import Any

SENSITIVE_CANDIDATES = (
    "fresh_blood_candidate",
    "melena_candidate",
    "foreign_material_candidate",
    "mucus_candidate",
)

FOCUSED_VERIFIER_FIELDS = (
    "fresh_blood_candidate",
    "melena_candidate",
)

VERIFICATION_VERDICTS = frozenset(
    {"confirmed", "not_confirmed", "unknown", "verification_unavailable"}
)
DIGESTIVE_ANOMALY_VERIFIER_VERSION = "digestive-anomaly-verifier/v1"

_ANOMALY_HINTS = {
    "fresh_blood_candidate": (
        "a distinct red or bright-red mark on or at the stool surface"
    ),
    "melena_candidate": (
        "a tarry, black, sticky stool appearance, not merely dark brown"
    ),
}


def _level(observation: dict[str, Any], field: str) -> str:
    return str(observation.get(field) or "unknown").lower()


def _stored_record(observation: dict[str, Any], field: str) -> dict[str, str] | None:
    stored = observation.get("anomaly_verification") or {}
    raw = stored.get(field)
    if isinstance(raw, dict):
        verdict = str(raw.get("verdict") or "").lower()
        version = str(raw.get("prompt_version") or "")
        if verdict in VERIFICATION_VERDICTS:
            return {"verdict": verdict, "prompt_version": version}
        return None
    verdict = str(raw or "").lower()
    if verdict in VERIFICATION_VERDICTS:
        return {"verdict": verdict, "prompt_version": ""}
    return None


def _stored_verdict(observation: dict[str, Any], field: str) -> str | None:
    record = _stored_record(observation, field)
    return record["verdict"] if record else None


def needed_anomaly_verifications(observation: dict[str, Any]) -> list[str]:
    """Fields that still need a focused look. Never includes clear_candidate."""

    needed: list[str] = []
    for field in FOCUSED_VERIFIER_FIELDS:
        if _level(observation, field) != "possible":
            continue
        record = _stored_record(observation, field)
        if record is None:
            needed.append(field)
            continue
        if record["prompt_version"] != DIGESTIVE_ANOMALY_VERIFIER_VERSION:
            needed.append(field)
            continue
        if record["verdict"] == "verification_unavailable":
            needed.append(field)
    return needed


def verification_unavailable(observation: dict[str, Any]) -> bool:
    """True when a possible blood/melena look could not be completed."""

    return bool(unavailable_anomaly_fields(observation))


def unavailable_anomaly_fields(observation: dict[str, Any]) -> list[str]:
    fields: list[str] = []
    for field in FOCUSED_VERIFIER_FIELDS:
        if _level(observation, field) != "possible":
            continue
        if _stored_verdict(observation, field) == "verification_unavailable":
            fields.append(field)
    return fields


def unavailable_caution_detail(observation: dict[str, Any]) -> str:
    fields = set(unavailable_anomaly_fields(observation))
    blood = "fresh_blood_candidate" in fields
    melena = "melena_candidate" in fields
    if blood and melena:
        return (
            "Se noti una traccia rossa evidente o feci molto scure e catramose, "
            "è meglio sentire il veterinario."
        )
    if melena:
        return (
            "Se noti feci molto scure o dall’aspetto catramoso, "
            "è meglio sentire il veterinario."
        )
    return (
        "Se noti una traccia rossa evidente, è meglio sentire il veterinario."
    )


def apply_anomaly_verification(
    observation: dict[str, Any],
    verdicts: dict[str, str],
) -> dict[str, Any]:
    stored = dict(observation.get("anomaly_verification") or {})
    for field, raw in verdicts.items():
        if field not in FOCUSED_VERIFIER_FIELDS:
            continue
        verdict = str(raw or "unknown").lower()
        if verdict not in VERIFICATION_VERDICTS:
            verdict = "unknown"
        stored[field] = {
            "verdict": verdict,
            "prompt_version": DIGESTIVE_ANOMALY_VERIFIER_VERSION,
        }
    observation["anomaly_verification"] = stored
    return observation


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
    if field not in FOCUSED_VERIFIER_FIELDS:
        return "possible_unverified"
    if _stored_verdict(observation, field) == "confirmed":
        return "possible"
    return "possible_unverified"


def verify_anomaly_candidates(observation: dict[str, Any]) -> dict[str, str]:
    """Return safety-facing candidate levels. Never downgrades clear evidence."""

    return {field: gate_candidate(observation, field) for field in SENSITIVE_CANDIDATES}


def safety_candidate(observation: dict[str, Any], field: str) -> str:
    gated = (observation.get("safety_candidates") or {}).get(field)
    if gated:
        return str(gated).lower()
    return gate_candidate(observation, field)


def anomaly_hint(field: str) -> str:
    return _ANOMALY_HINTS.get(field, "the indicated visual anomaly only")
