"""In-memory lifestyle profiles and append-only advice outcomes."""

from __future__ import annotations

from app.contracts.api import (
    AdviceOutcomeCreate,
    AdviceOutcomeOut,
    DogLifestyleOut,
    DogLifestylePatch,
)
from app.contracts.errors import ApiError, ErrorCode
from app.domains.dogs import get_owned_dog
from app.domains.repository import InMemoryStore, new_id, now_utc
from app.knowledge.models import AdviceOutcomeValue
from app.knowledge.registry import get_registry


def get_lifestyle(store: InMemoryStore, user_id: str, dog_id: str) -> DogLifestyleOut:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    row = store.dog_lifestyle_profiles.get(dog_id)
    return DogLifestyleOut(dog_id=dog_id, **row) if row else DogLifestyleOut(dog_id=dog_id)


def patch_lifestyle(
    store: InMemoryStore,
    user_id: str,
    dog_id: str,
    payload: DogLifestylePatch,
) -> DogLifestyleOut:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    now = now_utc().isoformat()
    existing = store.dog_lifestyle_profiles.get(dog_id, {})
    row = {
        "routine": {**existing.get("routine", {}), **(payload.routine or {})},
        "preferences": {
            **existing.get("preferences", {}),
            **(payload.preferences or {}),
        },
        "provenance": {
            **existing.get("provenance", {}),
            **(payload.provenance or {}),
        },
        "last_confirmed_at": now if payload.confirm else existing.get("last_confirmed_at"),
        "created_at": existing.get("created_at", now),
        "updated_at": now,
    }
    store.dog_lifestyle_profiles[dog_id] = row
    return DogLifestyleOut(dog_id=dog_id, **row)


def record_advice_outcome(
    store: InMemoryStore,
    user_id: str,
    event_id: str,
    payload: AdviceOutcomeCreate,
) -> AdviceOutcomeOut:
    event = store.behavior_events.get(event_id)
    if event is None or event.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Behavior event not found")
    advice = (event.interpretation_json or {}).get("advice") or {}
    valid_codes = {entry.code for entry in get_registry().advice_catalog}
    if payload.advice_code not in valid_codes or advice.get("code") != payload.advice_code:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Advice code does not belong to this event")
    outcome = AdviceOutcomeOut(
        id=new_id(),
        event_id=event_id,
        dog_id=event.dog_id,
        advice_code=payload.advice_code,
        outcome=payload.outcome,
        created_at=now_utc(),
    )
    store.advice_outcomes.append(
        {**outcome.model_dump(mode="json"), "user_id": user_id}
    )
    return outcome


def get_latest_advice_outcome(
    store: InMemoryStore,
    user_id: str,
    event_id: str,
) -> AdviceOutcomeValue | None:
    for row in reversed(store.advice_outcomes):
        if row["user_id"] == user_id and row["event_id"] == event_id:
            return AdviceOutcomeValue(row["outcome"])
    return None
