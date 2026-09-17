"""Owner-confirmed weight / BCS history. Monitoring facts, not diagnosis."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.contracts.errors import ApiError, ErrorCode
from app.domains.dogs import get_owned_dog
from app.domains.models import DogRec
from app.domains.repository import InMemoryStore, new_id, now_utc


class WeightEventRec(BaseModel):
    id: str
    dog_id: str
    user_id: str
    weight_kg: float
    body_condition_score: int | None = Field(default=None, ge=1, le=9)
    source: str = "OWNER"
    recorded_at: datetime
    created_at: datetime


def record_weight_event(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    weight_kg: float,
    body_condition_score: int | None = None,
    source: str = "OWNER",
    recorded_at: datetime | None = None,
    update_profile: bool = True,
) -> WeightEventRec:
    dog = get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    if weight_kg <= 0 or weight_kg >= 200:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Weight is outside a usable range.")
    event = WeightEventRec(
        id=new_id(),
        dog_id=dog.id,
        user_id=user_id,
        weight_kg=round(float(weight_kg), 2),
        body_condition_score=body_condition_score,
        source=source,
        recorded_at=recorded_at or now_utc(),
        created_at=now_utc(),
    )
    store.weight_events.setdefault(dog.id, []).append(event)
    if update_profile and dog.weight_kg != event.weight_kg:
        store.dogs[dog.id] = dog.model_copy(update={"weight_kg": event.weight_kg})
    return event


def list_weight_events(
    store: InMemoryStore, *, user_id: str, dog_id: str
) -> list[WeightEventRec]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    events = list(store.weight_events.get(dog_id, []))
    events.sort(key=lambda item: item.recorded_at, reverse=True)
    return events


def maybe_record_profile_weight(
    store: InMemoryStore, *, dog: DogRec, previous: float | None
) -> None:
    if dog.weight_kg is None or dog.weight_kg == previous:
        return
    record_weight_event(
        store,
        user_id=dog.owner_id,
        dog_id=dog.id,
        weight_kg=dog.weight_kg,
        update_profile=False,
    )


def nutrition_history_snapshot(
    store: InMemoryStore, *, dog_id: str
) -> dict[str, object]:
    events = list(store.weight_events.get(dog_id, []))
    events.sort(key=lambda item: item.recorded_at)
    if not events:
        return {"weight_points": 0, "latest_kg": None, "delta_kg": None}
    latest = events[-1]
    first = events[0]
    return {
        "weight_points": len(events),
        "latest_kg": latest.weight_kg,
        "delta_kg": round(latest.weight_kg - first.weight_kg, 2)
        if len(events) > 1
        else None,
    }
