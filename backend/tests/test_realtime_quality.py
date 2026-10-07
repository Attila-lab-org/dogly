import json
from pathlib import Path

from app.knowledge.realtime_quality import (
    RealtimeQualityLabel,
    score_realtime_quality,
)

EVALS = Path(__file__).parent / "evals" / "realtime_quality.jsonl"


def test_realtime_quality_fixture_covers_required_realistic_scenarios() -> None:
    cases = [json.loads(line) for line in EVALS.read_text(encoding="utf-8").splitlines()]
    assert {case["id"] for case in cases} == {
        "correction_nala",
        "yesterday_bruno",
        "affection_luna",
        "domain_change_bowie",
        "unknown_fact_kira",
        "long_context_otto",
    }
    assert all(len(case["turns"]) >= 1 for case in cases)
    assert all(len(case["rubric"]) == 3 for case in cases)
    assert {case["dog_name"] for case in cases} == {"Nala", "Bruno", "Luna", "Bowie", "Kira", "Otto"}


def test_realtime_quality_score_requires_all_dimensions_for_a_pass() -> None:
    report = score_realtime_quality(
        [
            RealtimeQualityLabel(
                case_id="correction",
                answered_current_turn=True,
                handled_correction=True,
                maintained_continuity=True,
                grounded_in_context=True,
                natural_dialogue=True,
            ),
            RealtimeQualityLabel(
                case_id="topic-change",
                answered_current_turn=True,
                handled_correction=True,
                maintained_continuity=True,
                grounded_in_context=True,
                natural_dialogue=False,
            ),
        ]
    )

    assert report["scenarios"] == 2
    assert report["passed"] == 1
    assert report["score"] == 0.5
    assert report["dimensions"]["natural_dialogue"] == 0.5


def test_realtime_quality_score_is_explicit_for_empty_evaluation() -> None:
    assert score_realtime_quality([]) == {
        "scenarios": 0,
        "passed": 0,
        "score": 0.0,
        "dimensions": {
            "answered_current_turn": 0.0,
            "handled_correction": 0.0,
            "maintained_continuity": 0.0,
            "grounded_in_context": 0.0,
            "natural_dialogue": 0.0,
        },
    }
