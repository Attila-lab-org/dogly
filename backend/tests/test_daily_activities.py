"""Daily routine activities — in-memory domain + weekday filter."""

from __future__ import annotations

import pytest

from app.contracts.api import DailyActivityCreate, DogCreate
from app.contracts.errors import ApiError
from app.contracts.taxonomy import DailyActivityKind
from app.domains import daily_activities as domain
from app.domains.dogs import create_dog
from app.domains.repository import InMemoryStore


@pytest.fixture
def store_with_dog() -> tuple[InMemoryStore, str, str]:
    store = InMemoryStore()
    user_id = "user-routine-1"
    dog = create_dog(store, user_id=user_id, payload=DogCreate(name="Oreo"))
    return store, user_id, dog.id


def test_create_list_filter_and_delete(store_with_dog: tuple[InMemoryStore, str, str]) -> None:
    store, user_id, dog_id = store_with_dog
    walk = domain.create_daily_activity(
        store,
        user_id=user_id,
        dog_id=dog_id,
        payload=DailyActivityCreate(
            title="Passeggiata",
            activity_kind=DailyActivityKind.WALK,
            local_time_minutes=8 * 60,
            duration_minutes=30,
            weekday_mask=0b0011111,  # Mon–Fri
        ),
    )
    domain.create_daily_activity(
        store,
        user_id=user_id,
        dog_id=dog_id,
        payload=DailyActivityCreate(
            title="Riposo",
            activity_kind=DailyActivityKind.REST,
            local_time_minutes=13 * 60,
            weekday_mask=0b1000000,  # Sunday only
        ),
    )

    monday = domain.list_daily_activities(store, user_id=user_id, dog_id=dog_id, weekday=0)
    assert [item.title for item in monday] == ["Passeggiata"]

    sunday = domain.list_daily_activities(store, user_id=user_id, dog_id=dog_id, weekday=6)
    assert [item.title for item in sunday] == ["Riposo"]

    all_items = domain.list_daily_activities(store, user_id=user_id, dog_id=dog_id)
    assert len(all_items) == 2
    assert all_items[0].local_time_minutes <= all_items[1].local_time_minutes

    domain.delete_daily_activity(store, user_id=user_id, activity_id=walk.id)
    assert domain.list_daily_activities(store, user_id=user_id, dog_id=dog_id, weekday=0) == []


def test_cannot_touch_other_users_activity(store_with_dog: tuple[InMemoryStore, str, str]) -> None:
    store, user_id, dog_id = store_with_dog
    item = domain.create_daily_activity(
        store,
        user_id=user_id,
        dog_id=dog_id,
        payload=DailyActivityCreate(
            title="Pasto",
            activity_kind=DailyActivityKind.MEAL,
            local_time_minutes=7 * 60,
        ),
    )
    with pytest.raises(ApiError):
        domain.get_owned_daily_activity(store, user_id="other-user", activity_id=item.id)
