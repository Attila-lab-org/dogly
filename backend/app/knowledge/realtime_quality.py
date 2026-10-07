"""Small offline quality score for human-adjudicated realtime turns."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

QUALITY_DIMENSIONS = (
    "answered_current_turn",
    "handled_correction",
    "maintained_continuity",
    "grounded_in_context",
    "natural_dialogue",
)


@dataclass(frozen=True)
class RealtimeQualityLabel:
    """Human label for one completed reasoner turn."""

    case_id: str
    answered_current_turn: bool
    handled_correction: bool
    maintained_continuity: bool
    grounded_in_context: bool
    natural_dialogue: bool

    def dimensions(self) -> dict[str, bool]:
        return {
            name: bool(getattr(self, name)) for name in QUALITY_DIMENSIONS
        }

    @property
    def passed(self) -> bool:
        return all(self.dimensions().values())


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
    dimensions = {
        name: (
            sum(item.dimensions()[name] for item in items) / total
            if total
            else 0.0
        )
        for name in QUALITY_DIMENSIONS
    }
    return {
        "scenarios": total,
        "passed": passed,
        "score": passed / total if total else 0.0,
        "dimensions": dimensions,
    }
