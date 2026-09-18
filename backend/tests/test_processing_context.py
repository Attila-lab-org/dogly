"""Processing Context Companion: deterministic planner + owner-reported facts."""

from __future__ import annotations

from datetime import UTC, datetime

from app.contracts.taxonomy import ContextBucket
from app.domains.processing_context import (
    MAX_PROCESSING_QUESTIONS,
    QUESTION_BANK,
    owner_facts_for_reasoner,
    plan_next_question,
)
from app.knowledge.models import DogContextSnapshot, LifeStageContext, LifestyleFact
from app.providers.base import EligiblePatternSummary


def _plan(**overrides):
    kwargs = {
        "dog_name": "Rocky",
        "context_bucket": ContextBucket.HOME,
        "has_audio": True,
        "occupied_question_ids": [],
    }
    kwargs.update(overrides)
    return plan_next_question(**kwargs)


def _collect(n: int = 6, **overrides) -> list[str]:
    occupied = list(overrides.pop("occupied_question_ids", []))
    ids: list[str] = []
    for _ in range(n):
        planned = _plan(occupied_question_ids=occupied, **overrides)
        if planned is None:
            break
        ids.append(planned.id)
        occupied.append(planned.id)
    return ids


def _snapshot(**updates) -> DogContextSnapshot:
    payload = {
        "dog_id": "dog-1",
        "name": "Rocky",
        "life_stage": LifeStageContext(
            value="UNKNOWN", source="UNKNOWN", confidence="LOW"
        ),
    }
    payload.update(updates)
    return DogContextSnapshot.model_validate(payload)


def test_planner_never_asks_more_than_three():
    ids = _collect(6, context_bucket=ContextBucket.UNKNOWN)
    assert len(ids) == MAX_PROCESSING_QUESTIONS
    assert len(set(ids)) == 3


def test_planner_does_not_repeat_answered_or_skipped():
    first = _plan()
    assert first is not None
    second = _plan(occupied_question_ids=[first.id])
    assert second is not None
    assert second.id != first.id
    third = _plan(occupied_question_ids=[first.id, second.id])
    assert third is not None
    assert third.id not in {first.id, second.id}
    assert _plan(occupied_question_ids=[first.id, second.id, third.id]) is None


def test_other_dog_prioritizes_familiarity_and_freedom():
    ids = _collect(3, context_bucket=ContextBucket.OTHER_DOG)
    assert "other_dog_present" not in ids
    assert "target_known" in ids
    assert "freedom_to_move" in ids


def test_handling_can_ask_discomfort():
    ids = _collect(3, context_bucket=ContextBucket.HANDLING)
    assert "discomfort_today" in ids


def test_missing_audio_makes_vocalization_eligible():
    with_audio = _collect(3, context_bucket=ContextBucket.HOME, has_audio=True)
    without = _collect(3, context_bucket=ContextBucket.HOME, has_audio=False)
    assert "owner_heard_vocalization" not in with_audio
    assert "owner_heard_vocalization" in without


def test_appetite_is_not_asked_universally():
    home = _collect(3, context_bucket=ContextBucket.HOME)
    walk = _collect(3, context_bucket=ContextBucket.WALK)
    feeding = _collect(3, context_bucket=ContextBucket.FEEDING)
    assert "appetite_today" not in home
    assert "appetite_today" not in walk
    assert "appetite_today" in feeding


def test_weather_and_temperature_are_not_standard_questions():
    assert "weather" not in QUESTION_BANK
    assert "temperature" not in QUESTION_BANK
    for bucket in ContextBucket:
        ids = _collect(3, context_bucket=bucket)
        assert "weather" not in ids
        assert "temperature" not in ids


def test_established_memory_suppresses_behavior_seen_before():
    memory = [
        EligiblePatternSummary(
            pattern_id="p1",
            state="ESTABLISHED",
            title="Vigilanza alla porta",
            support_summary="Confermato più volte",
        )
    ]
    asked = _collect(
        3,
        context_bucket=ContextBucket.PLAY,
        eligible_memory=memory,
    )
    assert "behavior_seen_before" not in asked


def test_recent_changes_suppress_duplicate_question():
    context = _snapshot(
        recent_changes=[
            LifestyleFact(
                key="routine",
                value="nuovo orario passeggiata",
                provenance="OWNER_REPORTED",
                last_confirmed_at=datetime.now(UTC),
            )
        ]
    )
    asked = _collect(
        3,
        context_bucket=ContextBucket.VEHICLE,
        dog_context=context,
    )
    assert "recent_change" not in asked


def test_insufficient_video_asks_nothing():
    planned = _plan(
        observation={"capture_quality": {"overall_quality": "insufficient"}}
    )
    assert planned is None


def test_skip_does_not_create_owner_fact():
    facts = owner_facts_for_reasoner(
        [
            {
                "question_id": "usual_situation",
                "answer_id": None,
                "skipped": True,
            },
            {
                "question_id": "usual_situation",
                "answer_id": "unusual",
                "skipped": False,
            },
        ]
    )
    assert [item.question_id for item in facts] == ["usual_situation"]
    assert facts[0].provenance == "OWNER_REPORTED"
    assert facts[0].answer_id == "unusual"


def test_unknown_prefers_general_high_value_questions():
    ids = _collect(3, context_bucket=ContextBucket.UNKNOWN)
    assert ids[0] in {"before_moment", "usual_situation"}
    assert "usual_situation" in ids
    assert "before_moment" in ids
    assert "freedom_to_move" not in ids
    assert "target_known" not in ids
    assert "other_dog_present" not in ids


def test_questions_use_dog_name_not_technical_codes():
    planned = _plan(context_bucket=ContextBucket.DOOR_EXIT)
    assert planned is not None
    assert "Rocky" in planned.text or planned.id == "usual_situation"
    assert "confidence" not in planned.text.lower()
    assert "observation" not in planned.text.lower()
    for option in planned.options:
        assert 2 <= len(planned.options) <= 4
        assert "_" not in option.label
