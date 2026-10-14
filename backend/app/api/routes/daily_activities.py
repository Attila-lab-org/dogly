"""Daily routine activity routes."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    DailyActivityCreate,
    DailyActivityListResponse,
    DailyActivityOut,
    DailyActivityUpdate,
)
from app.domains import daily_activities as domain
from app.domains import daily_activities_db as db
from app.domains import idempotency_db
from app.domains.models import DailyActivityRec

router = APIRouter()


def to_out(item: DailyActivityRec) -> DailyActivityOut:
    return DailyActivityOut.model_validate(item.model_dump())


async def _record_guard(state: StateDep, guard: IdempotencyDep, body: dict) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


@router.get(
    "/dogs/{dog_id}/daily-activities",
    response_model=DailyActivityListResponse,
)
async def list_activities(
    dog_id: str,
    state: StateDep,
    user_id: UserIdDep,
    weekday: int | None = Query(default=None, ge=0, le=6),
) -> DailyActivityListResponse:
    if state.engine is not None:
        items = await db.list_daily_activities(
            state.engine, user_id=user_id, dog_id=dog_id, weekday=weekday
        )
    else:
        items = domain.list_daily_activities(
            state.store, user_id=user_id, dog_id=dog_id, weekday=weekday
        )
    return DailyActivityListResponse(items=[to_out(item) for item in items])


@router.post(
    "/dogs/{dog_id}/daily-activities",
    response_model=DailyActivityOut,
    status_code=201,
)
async def create_activity(
    dog_id: str,
    payload: DailyActivityCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> DailyActivityOut:
    if cached := guard.lookup():
        return DailyActivityOut.model_validate(cached)
    if state.engine is not None:
        item = await db.create_daily_activity(
            state.engine, user_id=user_id, dog_id=dog_id, payload=payload
        )
    else:
        item = domain.create_daily_activity(
            state.store, user_id=user_id, dog_id=dog_id, payload=payload
        )
    response = to_out(item)
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


@router.patch(
    "/daily-activities/{activity_id}",
    response_model=DailyActivityOut,
)
async def update_activity(
    activity_id: str,
    payload: DailyActivityUpdate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> DailyActivityOut:
    if cached := guard.lookup():
        return DailyActivityOut.model_validate(cached)
    if state.engine is not None:
        item = await db.update_daily_activity(
            state.engine, user_id=user_id, activity_id=activity_id, payload=payload
        )
    else:
        item = domain.update_daily_activity(
            state.store, user_id=user_id, activity_id=activity_id, payload=payload
        )
    response = to_out(item)
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


@router.delete("/daily-activities/{activity_id}", status_code=204)
async def delete_activity(
    activity_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> None:
    if state.engine is not None:
        await db.delete_daily_activity(
            state.engine, user_id=user_id, activity_id=activity_id
        )
    else:
        domain.delete_daily_activity(
            state.store, user_id=user_id, activity_id=activity_id
        )
