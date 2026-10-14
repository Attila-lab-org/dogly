"""PostgreSQL repository for dog daily activities."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import DailyActivityCreate, DailyActivityUpdate
from app.contracts.errors import ApiError, ErrorCode
from app.domains import dogs_db
from app.domains.models import DailyActivityRec
from app.domains.repository import now_utc

_COLUMNS = """
  id, dog_id, user_id, title, activity_kind, local_time_minutes, duration_minutes,
  weekday_mask, notes, active, created_at, updated_at
"""


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _row(row: Any) -> DailyActivityRec:
    data = dict(row)
    data["id"] = str(data["id"])
    data["dog_id"] = str(data["dog_id"])
    data["user_id"] = str(data["user_id"])
    return DailyActivityRec.model_validate(data)


async def list_daily_activities(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    weekday: int | None = None,
) -> list[DailyActivityRec]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    weekday_clause = ""
    params: dict[str, Any] = {"dog_id": dog_id, "user_id": user_id}
    if weekday is not None:
        weekday_clause = "and (weekday_mask & :weekday_bit) <> 0"
        params["weekday_bit"] = 1 << weekday
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    f"""
                    select {_COLUMNS}
                    from public.dog_daily_activities
                    where dog_id = :dog_id
                      and user_id = :user_id
                      and active = true
                      {weekday_clause}
                    order by local_time_minutes asc, id asc
                    """
                ),
                params,
            )
        ).mappings().all()
    return [_row(row) for row in rows]


async def create_daily_activity(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    payload: DailyActivityCreate,
) -> DailyActivityRec:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    f"""
                    insert into public.dog_daily_activities (
                      dog_id, user_id, title, activity_kind, local_time_minutes,
                      duration_minutes, weekday_mask, notes
                    ) values (
                      :dog_id, :user_id, :title, :activity_kind, :local_time_minutes,
                      :duration_minutes, :weekday_mask, :notes
                    )
                    returning {_COLUMNS}
                    """
                ),
                {
                    "dog_id": dog_id,
                    "user_id": user_id,
                    "title": payload.title,
                    "activity_kind": _enum_value(payload.activity_kind),
                    "local_time_minutes": payload.local_time_minutes,
                    "duration_minutes": payload.duration_minutes,
                    "weekday_mask": payload.weekday_mask,
                    "notes": payload.notes,
                },
            )
        ).mappings().one()
    return _row(row)


async def update_daily_activity(
    engine: AsyncEngine,
    *,
    user_id: str,
    activity_id: str,
    payload: DailyActivityUpdate,
) -> DailyActivityRec:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        async with engine.connect() as conn:
            row = (
                await conn.execute(
                    text(
                        f"""
                        select {_COLUMNS}
                        from public.dog_daily_activities
                        where id = :activity_id and user_id = :user_id
                        """
                    ),
                    {"activity_id": activity_id, "user_id": user_id},
                )
            ).mappings().first()
        if row is None:
            raise ApiError(ErrorCode.NOT_FOUND, "Activity not found")
        return _row(row)

    assignments = ", ".join(f"{key} = :{key}" for key in changes)
    params = {
        "activity_id": activity_id,
        "user_id": user_id,
        "updated_at": now_utc(),
        **{key: _enum_value(value) for key, value in changes.items()},
    }
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    f"""
                    update public.dog_daily_activities
                    set {assignments}, updated_at = :updated_at
                    where id = :activity_id and user_id = :user_id
                    returning {_COLUMNS}
                    """
                ),
                params,
            )
        ).mappings().first()
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Activity not found")
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=str(row["dog_id"]))
    return _row(row)


async def delete_daily_activity(
    engine: AsyncEngine,
    *,
    user_id: str,
    activity_id: str,
) -> None:
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                """
                delete from public.dog_daily_activities
                where id = :activity_id and user_id = :user_id
                """
            ),
            {"activity_id": activity_id, "user_id": user_id},
        )
    if result.rowcount == 0:
        raise ApiError(ErrorCode.NOT_FOUND, "Activity not found")
