"""Care agenda domain: owner-scoped appointments and reminders."""

from __future__ import annotations

from app.contracts.api import CareEventCreate, CareEventUpdate
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import CareEventStatus
from app.domains.dogs import get_owned_dog
from app.domains.models import CareEventRec
from app.domains.repository import InMemoryStore, new_id, now_utc


def list_care_events(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    include_completed: bool = False,
) -> list[CareEventRec]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    events = [
        event
        for event in store.care_events.values()
        if event.dog_id == dog_id
        and event.user_id == user_id
        and (
            include_completed
            or event.status == CareEventStatus.SCHEDULED
        )
    ]
    return sorted(events, key=lambda event: (event.scheduled_at, event.id))


def create_care_event(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    payload: CareEventCreate,
) -> CareEventRec:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    now = now_utc()
    event = CareEventRec(
        id=new_id(),
        dog_id=dog_id,
        user_id=user_id,
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    store.care_events[event.id] = event
    return event


def get_owned_care_event(
    store: InMemoryStore,
    *,
    user_id: str,
    event_id: str,
) -> CareEventRec:
    event = store.care_events.get(event_id)
    if event is None or event.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Care event not found")
    get_owned_dog(store, user_id=user_id, dog_id=event.dog_id)
    return event


def update_care_event(
    store: InMemoryStore,
    *,
    user_id: str,
    event_id: str,
    payload: CareEventUpdate,
) -> CareEventRec:
    event = get_owned_care_event(store, user_id=user_id, event_id=event_id)
    changes = payload.model_dump(exclude_unset=True)
    required = {
        "event_type",
        "title",
        "scheduled_at",
        "all_day",
        "timezone",
        "reminder_enabled",
        "reminder_minutes_before",
        "status",
    }
    if any(changes.get(field) is None for field in required if field in changes):
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Required care event fields cannot be null")

    if changes.get("status") == CareEventStatus.COMPLETED:
        changes["completed_at"] = now_utc()
    elif "status" in changes:
        changes["completed_at"] = None

    changes["updated_at"] = now_utc()
    updated = event.model_copy(update=changes)
    store.care_events[event.id] = updated
    return updated


def delete_care_event(
    store: InMemoryStore,
    *,
    user_id: str,
    event_id: str,
) -> None:
    event = get_owned_care_event(store, user_id=user_id, event_id=event_id)
    del store.care_events[event.id]
