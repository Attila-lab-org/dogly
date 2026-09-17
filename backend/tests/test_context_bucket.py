"""Context bucket resolution when the client sends UNKNOWN."""

from datetime import UTC, datetime

from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ContextBucket
from app.domains.context_bucket import (
    derive_from_clock,
    derive_from_observation,
    resolve_context_bucket,
)
from app.providers.mock import load_fixture


def _observation(**scene_updates) -> ObservationContract:
    raw = load_fixture("observation.fixture.json")
    raw["scene"].update(scene_updates)
    return ObservationContract.model_validate(raw)


def test_observed_context_overrides_client_hint():
    assert (
        resolve_context_bucket(
            ContextBucket.WALK, observation=_observation()
        )
        is ContextBucket.PLAY
    )


def test_client_hint_is_kept_when_observation_is_ambiguous():
    obs = _observation(
        environment_class="unknown",
        visible_objects=[],
        spatial_relations=[],
        dog_count=1,
    )
    obs = obs.model_copy(
        update={"body": obs.body.model_copy(update={"posture": "unknown"})}
    )
    assert resolve_context_bucket(ContextBucket.WALK, observation=obs) is ContextBucket.WALK


def test_toy_in_scene_resolves_play():
    assert derive_from_observation(_observation()) is ContextBucket.PLAY


def test_door_in_scene_resolves_door_exit():
    obs = _observation(visible_objects=["door", "leash"])
    assert derive_from_observation(obs) is ContextBucket.DOOR_EXIT
    assert (
        resolve_context_bucket(ContextBucket.UNKNOWN, observation=obs)
        is ContextBucket.DOOR_EXIT
    )


def test_bowl_resolves_feeding():
    obs = _observation(visible_objects=["bowl", "food"])
    assert derive_from_observation(obs) is ContextBucket.FEEDING


def test_unknown_without_observation_stays_unknown_until_worker():
    assert (
        resolve_context_bucket(ContextBucket.UNKNOWN)
        is ContextBucket.UNKNOWN
    )


def test_unknown_with_ambiguous_observation_falls_back_to_home():
    obs = _observation(
        environment_class="unknown",
        visible_objects=[],
        spatial_relations=[],
        dog_count=1,
    )
    obs = obs.model_copy(
        update={"body": obs.body.model_copy(update={"posture": "unknown"})}
    )
    assert derive_from_observation(obs) is None
    assert (
        resolve_context_bucket(ContextBucket.UNKNOWN, observation=obs)
        is ContextBucket.HOME
    )


def test_meal_window_from_lifestyle_clock():
    now = datetime(2026, 9, 7, 8, 10, tzinfo=UTC)
    bucket = derive_from_clock(
        now,
        {"routine": {"meal_schedule": {"typical_times": ["08:00", "19:00"]}}},
    )
    assert bucket is ContextBucket.FEEDING


def test_night_hours_resolve_rest_at_init():
    now = datetime(2026, 9, 7, 23, 40, tzinfo=UTC)
    assert (
        resolve_context_bucket(
            ContextBucket.UNKNOWN,
            lifestyle={},
            now=now,
        )
        is ContextBucket.REST
    )
