"""Owner-planned daily routine activities (timed day schedule)."""

from __future__ import annotations

from app.contracts.api import DailyActivityCreate, DailyActivityUpdate
from app.contracts.errors import ApiError, ErrorCode
from app.domains.dogs import get_owned_dog
from app.domains.models import DailyActivityRec
from app.domains.repository import InMemoryStore, new_id, now_utc


def list_daily_activities(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    weekday: int | None = None,
) -> list[DailyActivityRec]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    items = [
        item
        for item in store.daily_activities.values()
        if item.dog_id == dog_id and item.user_id == user_id and item.active
    ]
    if weekday is not None:
        bit = 1 << weekday
        items = [item for item in items if item.weekday_mask & bit]
    return sorted(items, key=lambda item: (item.local_time_minutes, item.id))


def create_daily_activity(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    payload: DailyActivityCreate,
) -> DailyActivityRec:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    now = now_utc()
    item = DailyActivityRec(
        id=new_id(),
        dog_id=dog_id,
        user_id=user_id,
        created_at=now,
        updated_at=now,
        active=True,
        **payload.model_dump(),
    )
    store.daily_activities[item.id] = item
    return item


def get_owned_daily_activity(
    store: InMemoryStore,
    *,
    user_id: str,
    activity_id: str,
) -> DailyActivityRec:
    item = store.daily_activities.get(activity_id)
    if item is None or item.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Activity not found")
    get_owned_dog(store, user_id=user_id, dog_id=item.dog_id)
    return item


def update_daily_activity(
    store: InMemoryStore,
    *,
    user_id: str,
    activity_id: str,
    payload: DailyActivityUpdate,
) -> DailyActivityRec:
    item = get_owned_daily_activity(store, user_id=user_id, activity_id=activity_id)
    changes = payload.model_dump(exclude_unset=True)
    for field in ("title", "activity_kind", "local_time_minutes", "weekday_mask"):
        if field in changes and changes[field] is None:
            raise ApiError(ErrorCode.VALIDATION_FAILED, "Required activity fields cannot be null")
    changes["updated_at"] = now_utc()
    updated = item.model_copy(update=changes)
    store.daily_activities[item.id] = updated
    return updated


def delete_daily_activity(
    store: InMemoryStore,
    *,
    user_id: str,
    activity_id: str,
) -> None:
    item = get_owned_daily_activity(store, user_id=user_id, activity_id=activity_id)
    del store.daily_activities[item.id]
