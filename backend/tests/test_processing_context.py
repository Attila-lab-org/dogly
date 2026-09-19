"""Processing Context Companion: deterministic planner + owner-reported facts."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.contracts.taxonomy import ContextBucket
from app.domains.processing_context import (
    MAX_PROCESSING_QUESTIONS,
    QUESTION_BANK,
    owner_facts_for_reasoner,
    plan_next_question,
)
from app.domains.processing_context_store import answer_from_row
from app.knowledge.models import DogContextSnapshot, LifeStageContext, LifestyleFact
from app.providers.base import EligiblePatternSummary
from app.providers.mock import load_fixture


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


def _observation(
    *,
    environment: str = "unknown",
    objects: list[str] | None = None,
    dog_count: int = 1,
) -> dict:
    raw = load_fixture("observation.fixture.json")
    raw["capture_quality"].update(
        {
            "overall_quality": "good",
            "audio_quality": "good",
            "dog_visible_fraction": 0.8,
        }
    )
    raw["scene"].update(
        {
            "environment_class": environment,
            "visible_objects": objects or [],
            "spatial_relations": [],
            "dog_count": dog_count,
        }
    )
    raw["body"]["posture"] = "unknown"
    raw["body"]["orientation_target"] = "unknown"
    raw["head_face"]["head_orientation"] = "unknown"
    raw["head_face"]["gaze_target"] = "unknown"
    return raw


def test_planner_asks_at_most_one_question():
    ids = _collect(6, context_bucket=ContextBucket.UNKNOWN)
    assert len(ids) == MAX_PROCESSING_QUESTIONS
    assert len(set(ids)) == 1


def test_planner_does_not_repeat_answered_or_skipped():
    first = _plan()
    assert first is not None
    second = _plan(occupied_question_ids=[first.id])
    assert second is None


def test_other_dog_prioritizes_familiarity_and_freedom():
    ids = _collect(
        3,
        context_bucket=ContextBucket.OTHER_DOG,
        observation=_observation(dog_count=2),
    )
    assert "other_dog_present" not in ids
    assert ids[0] in {"target_known", "freedom_to_move"}


def test_handling_can_ask_discomfort():
    ids = _collect(
        3,
        context_bucket=ContextBucket.HANDLING,
        observation=_observation(),
    )
    assert ids[0] in {"owner_interaction", "discomfort_today", "usual_situation"}


def test_missing_audio_makes_vocalization_eligible():
    observation = _observation(environment="indoor")
    with_audio = _collect(
        3, context_bucket=ContextBucket.HOME, has_audio=True, observation=observation
    )
    without = _collect(
        3, context_bucket=ContextBucket.HOME, has_audio=False, observation=observation
    )
    assert "owner_heard_vocalization" not in with_audio
    assert "owner_heard_vocalization" in without


def test_appetite_is_not_asked_universally():
    home = _collect(
        3,
        context_bucket=ContextBucket.HOME,
        observation=_observation(environment="indoor"),
    )
    walk = _collect(
        3,
        context_bucket=ContextBucket.WALK,
        observation=_observation(environment="outdoor"),
    )
    feeding = _collect(
        3,
        context_bucket=ContextBucket.FEEDING,
        observation=_observation(objects=["bowl"]),
    )
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
        observation=_observation(objects=["toy"]),
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
        observation=_observation(objects=["car"]),
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
    assert "freedom_to_move" not in ids
    assert "target_known" not in ids
    assert "other_dog_present" not in ids


def test_question_copy_never_exposes_technical_codes():
    planned = _plan(
        context_bucket=ContextBucket.DOOR_EXIT,
        observation=_observation(objects=["door"]),
    )
    assert planned is not None
    assert "confidence" not in planned.text.lower()
    assert "observation" not in planned.text.lower()
    for option in planned.options:
        assert 2 <= len(planned.options) <= 4
        assert "_" not in option.label


def test_garden_scene_never_asks_about_a_door_from_capture_hint():
    planned = _plan(
        context_bucket=ContextBucket.DOOR_EXIT,
        observation=_observation(
            environment="outdoor garden",
            objects=["grass", "gravel", "stone_wall", "plant"],
        ),
    )
    assert planned is not None
    assert planned.id != "outside_trigger"
    assert "porta" not in planned.text.casefold()
    assert "finestra" not in planned.text.casefold()


def test_answer_from_row_accepts_postgres_uuids():
    rec = answer_from_row(
        {
            "id": UUID("32d54853-57a3-4531-a7ad-2d622c20d7ce"),
            "event_id": UUID("aa0e4a8e-5248-41a2-9d42-7750fa0e7c0a"),
            "user_id": UUID("ebc261ae-819a-4246-99c2-3a2ff6ff4f8d"),
            "question_id": "before_moment",
            "answer_id": "playing",
            "skipped": False,
            "question_version": "processing-questions/v1",
            "source": "OWNER_REPORTED",
            "answered_at": datetime.now(UTC),
            "created_at": datetime.now(UTC),
        }
    )
    assert rec.id == "32d54853-57a3-4531-a7ad-2d622c20d7ce"
    assert rec.event_id == "aa0e4a8e-5248-41a2-9d42-7750fa0e7c0a"
    assert rec.user_id == "ebc261ae-819a-4246-99c2-3a2ff6ff4f8d"
    assert rec.answer_id == "playing"
