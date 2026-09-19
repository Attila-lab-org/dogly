"""Server-side context bucket resolution (Behavior Intelligence V2 P0).

The mobile client often cannot know HOME vs DOOR_EXIT vs PLAY before the
video is observed. If it sends UNKNOWN, retrieval and the reasoner must not
stay blind: we derive from the observation first, then from clock/lifestyle,
then HOME so knowledge cards still fire.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.contracts.observation import ObservationContract, Posture
from app.contracts.taxonomy import ContextBucket
from app.knowledge.models import DogContextSnapshot

logger = logging.getLogger(__name__)

_EXIT_OBJECTS = {"door", "gate", "porta", "cancello"}
_WALK_OBJECTS = {"leash", "lead", "guinzaglio"}
_FOOD_OBJECTS = {"bowl", "food", "kibble", "ciotola"}
_PLAY_OBJECTS = {"toy", "ball", "rope", "toy_rope", "frisbee"}
_VEHICLE_OBJECTS = {"car", "vehicle", "crate"}


def _norm(items: list[str] | tuple[str, ...] | set[str]) -> set[str]:
    return {str(item).lower().replace("-", "_") for item in items}


def observation_supports_exit(observation: ObservationContract | None) -> bool:
    """True only when the clip itself contains an exit cue.

    A client hint, an outdoor location, a collar or a leash are not enough to
    claim that the dog is oriented toward a door or asking to go outside.
    """
    if observation is None:
        return False
    scene = observation.scene
    objects = _norm(scene.visible_objects)
    relations = _norm(scene.spatial_relations)
    target_text = " ".join(
        str(value).casefold()
        for value in (
            observation.body.orientation_target,
            observation.head_face.head_orientation,
            observation.head_face.gaze_target,
        )
        if value
    )
    return bool(
        objects & _EXIT_OBJECTS
        or relations & {"near_door", "near_gate", "vicino_porta", "vicino_cancello"}
        or any(
            token in target_text
            for token in ("door", "gate", "porta", "cancello", "uscita", "exit")
        )
    )


def derive_from_observation(
    observation: ObservationContract | None,
) -> ContextBucket | None:
    """High-signal scene cues only. Returns None when the video is ambiguous."""
    if observation is None:
        return None
    scene = observation.scene
    objects = _norm(scene.visible_objects)
    env = (scene.environment_class or "unknown").lower()
    env_tokens = set(env.replace("-", "_").replace(" ", "_").split("_"))

    if (scene.dog_count or 0) > 1 or "other_dog" in objects:
        return ContextBucket.OTHER_DOG
    if observation_supports_exit(observation) or bool(
        env_tokens & _EXIT_OBJECTS
    ):
        return ContextBucket.DOOR_EXIT
    if objects & _FOOD_OBJECTS or "feeding" in env:
        return ContextBucket.FEEDING
    if (
        objects & _PLAY_OBJECTS
        or observation.body.posture == Posture.PLAY_BOW
        or "play" in env
    ):
        return ContextBucket.PLAY
    if objects & _VEHICLE_OBJECTS or "car" in env or "vehicle" in env:
        return ContextBucket.VEHICLE
    if any(token in env for token in ("outdoor", "park", "garden", "yard", "street")):
        locomotion = (observation.body.locomotion or "unknown").lower()
        if locomotion == "walking" or objects & _WALK_OBJECTS:
            return ContextBucket.WALK
        return ContextBucket.OUTDOORS
    if "home" in env or "indoor" in env or "living" in env:
        return ContextBucket.HOME
    return None


def derive_from_clock(
    now: datetime | None,
    lifestyle: dict[str, Any] | None,
) -> ContextBucket | None:
    """Meal windows and night rest from owner-reported routine. Conservative."""
    current = now or datetime.now(UTC)
    hour = current.hour
    minute = current.minute
    minutes = hour * 60 + minute

    routine = dict((lifestyle or {}).get("routine") or {})
    meal = routine.get("meal_schedule") or {}
    times = meal.get("typical_times") or []
    for raw in times:
        try:
            parts = str(raw).split(":")
            meal_minutes = int(parts[0]) * 60 + int(parts[1] if len(parts) > 1 else 0)
        except (TypeError, ValueError):
            continue
        if abs(minutes - meal_minutes) <= 45:
            return ContextBucket.FEEDING

    if hour >= 22 or hour < 6:
        return ContextBucket.REST
    return None


def resolve_context_bucket(
    requested: ContextBucket,
    *,
    observation: ObservationContract | None = None,
    lifestyle: dict[str, Any] | None = None,
    dog_context: DogContextSnapshot | None = None,
    now: datetime | None = None,
) -> ContextBucket:
    """Honor an explicit client bucket; never leave the reasoner on UNKNOWN
    once an observation exists.

    `dog_context` is accepted so callers can pass the assembled snapshot
    without converting it back to a lifestyle dict (unused for derivation).
    """
    del dog_context
    from_obs = derive_from_observation(observation)
    if from_obs is not None:
        logger.info("behavior.context_bucket.resolved_from_observation %s", from_obs.value)
        return from_obs
    if requested != ContextBucket.UNKNOWN:
        logger.info(
            "behavior.context_bucket.using_client_hint %s",
            requested.value,
        )
        return requested

    logger.info("behavior.context_bucket.unknown_from_client")
    from_clock = derive_from_clock(now, lifestyle)
    if from_clock is not None:
        logger.info("behavior.context_bucket.resolved_from_clock %s", from_clock.value)
        return from_clock

    if observation is not None:
        logger.info("behavior.context_bucket.fallback_home")
        return ContextBucket.HOME
    return ContextBucket.UNKNOWN
