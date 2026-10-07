"""Small offline quality score for human-adjudicated realtime turns."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

QUALITY_DIMENSIONS = (
    "answered_current_turn",
    "handled_correction",
    "maintained_continuity",
    "grounded_in_context",
    "natural_dialogue",
)
QualityResult = Literal["pass", "fail", "unmeasurable"]


@dataclass(frozen=True)
class RealtimeQualityLabel:
    """Human label for one completed reasoner turn."""

    case_id: str
    answered_current_turn: QualityResult
    handled_correction: QualityResult
    maintained_continuity: QualityResult
    grounded_in_context: QualityResult
    natural_dialogue: QualityResult

    def dimensions(self) -> dict[str, QualityResult]:
        return {
            name: getattr(self, name) for name in QUALITY_DIMENSIONS
        }

    @property
    def passed(self) -> bool:
        return all(value == "pass" for value in self.dimensions().values())


def score_realtime_quality(
    labels: Iterable[RealtimeQualityLabel],
) -> dict[str, object]:
    """Return a transparent scenario and dimension score.

    The labels are human-adjudicated offline; this function does not inspect or
    rewrite the answer and is intentionally outside the production turn path.
    """

    items = list(labels)
    total = len(items)
    passed = sum(item.passed for item in items)
    dimensions = {}
    for name in QUALITY_DIMENSIONS:
        values = [item.dimensions()[name] for item in items]
        measured = [value for value in values if value != "unmeasurable"]
        dimensions[name] = (
            measured.count("pass") / len(measured) if measured else None
        )
    measured_values = [
        value
        for item in items
        for value in item.dimensions().values()
        if value != "unmeasurable"
    ]
    has_unmeasurable = any(
        value == "unmeasurable"
        for item in items
        for value in item.dimensions().values()
    )
    has_negative_control = "fail" in measured_values
    reliable = bool(items) and not has_unmeasurable and has_negative_control
    return {
        "scenarios": total,
        "passed": passed,
        "score": (
            measured_values.count("pass") / len(measured_values)
            if reliable
            else None
        ),
        "reliable": reliable,
        "status": "measured" if reliable else "unmeasurable",
        "dimensions": dimensions,
    }
