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
                answered_current_turn="pass",
                handled_correction="pass",
                maintained_continuity="pass",
                grounded_in_context="pass",
                natural_dialogue="pass",
            ),
            RealtimeQualityLabel(
                case_id="topic-change",
                answered_current_turn="pass",
                handled_correction="pass",
                maintained_continuity="pass",
                grounded_in_context="pass",
                natural_dialogue="fail",
            ),
        ]
    )

    assert report["scenarios"] == 2
    assert report["passed"] == 1
    assert report["score"] == 0.9
    assert report["reliable"] is True
    assert report["dimensions"]["natural_dialogue"] == 0.5


def test_realtime_quality_score_is_explicit_for_empty_evaluation() -> None:
    assert score_realtime_quality([]) == {
        "scenarios": 0,
        "passed": 0,
        "score": None,
        "reliable": False,
        "status": "unmeasurable",
        "dimensions": {
            "answered_current_turn": None,
            "handled_correction": None,
            "maintained_continuity": None,
            "grounded_in_context": None,
            "natural_dialogue": None,
        },
    }


def test_realtime_quality_marks_semantic_dimensions_unmeasurable() -> None:
    report = score_realtime_quality(
        [
            RealtimeQualityLabel(
                case_id="only-pass",
                answered_current_turn="pass",
                handled_correction="unmeasurable",
                maintained_continuity="unmeasurable",
                grounded_in_context="unmeasurable",
                natural_dialogue="pass",
            )
        ]
    )
    assert report["score"] is None
    assert report["reliable"] is False
    assert report["status"] == "unmeasurable"
