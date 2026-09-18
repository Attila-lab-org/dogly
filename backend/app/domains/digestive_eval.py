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

EVALUATED_FIELDS = (
    "image_quality",
    "consistency",
    "shape",
    "apparent_moisture",
    "segmentation",
    "color_family",
    "mucus_candidate",
    "fresh_blood_candidate",
    "melena_candidate",
    "foreign_material_candidate",
    "undigested_food_candidate",
)
SAFETY_CANDIDATE_FIELDS = (
    "fresh_blood_candidate",
    "melena_candidate",
    "foreign_material_candidate",
)


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


def score_labeled_observation(
    observation: dict[str, Any],
    expected: dict[str, Any],
) -> dict[str, Any]:
    """Score one observer output against a manually adjudicated label set.

    Labels may be sparse: only supplied fields are scored. Safety false
    positives are reported separately because aggregate accuracy can hide
    consumer-harmful anomaly hallucinations.
    """

    prepared = prepare_digestive_observation(observation)
    compared = [field for field in EVALUATED_FIELDS if field in expected]
    matches = [
        field
        for field in compared
        if str(prepared.get(field)) == str(expected.get(field))
    ]
    mismatches = {
        field: {
            "expected": expected.get(field),
            "actual": prepared.get(field),
        }
        for field in compared
        if field not in matches
    }
    safety_false_positives = [
        field
        for field in SAFETY_CANDIDATE_FIELDS
        if str(expected.get(field)) == "none_observed"
        and str(prepared.get(field)) in {"possible", "clear_candidate"}
    ]
    safety_false_negatives = [
        field
        for field in SAFETY_CANDIDATE_FIELDS
        if str(expected.get(field)) in {"possible", "clear_candidate"}
        and str(prepared.get(field)) == "none_observed"
    ]
    return {
        "fields_scored": len(compared),
        "fields_correct": len(matches),
        "field_accuracy": (
            round(len(matches) / len(compared), 4) if compared else None
        ),
        "mismatches": mismatches,
        "safety_false_positives": safety_false_positives,
        "safety_false_negatives": safety_false_negatives,
    }
