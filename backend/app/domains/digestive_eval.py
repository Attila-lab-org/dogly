"""Offline digestive stability harness. No live model calls."""

from __future__ import annotations

from typing import Any

from app.domains.digestive import deterministic_safety_flags
from app.domains.digestive_intelligence import (
    DigestiveContext,
    build_digestive_intelligence,
)
from app.domains.digestive_observation import (
    prepare_digestive_observation,
)
from app.domains.digestive_verification import safety_candidate


def evaluate_observation(observation: dict[str, Any], *, dog_name: str = "Oreo") -> dict[str, Any]:
    prepared = prepare_digestive_observation(observation)
    intelligence = build_digestive_intelligence(
        prepared,
        DigestiveContext(dog_name=dog_name),
    )
    return {
        "score": prepared.get("fecal_score_estimate"),
        "color_family": prepared.get("color_family"),
        "foreign": safety_candidate(prepared, "foreign_material_candidate"),
        "blood": safety_candidate(prepared, "fresh_blood_candidate"),
        "melena": safety_candidate(prepared, "melena_candidate"),
        "safety_state": intelligence.safety_state.value,
        "overall_state": intelligence.overall_state.value,
        "learning_eligible": prepared.get("learning_eligible"),
        "flags": [item["code"] for item in deterministic_safety_flags(prepared)],
    }


def compare_repeated(observation: dict[str, Any], *, runs: int = 5) -> list[dict[str, Any]]:
    return [evaluate_observation(observation) for _ in range(runs)]
