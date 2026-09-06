"""PostgreSQL repository for dog care agenda events."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import CareEventCreate, CareEventUpdate
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import CareEventStatus
from app.domains import dogs_db
from app.domains.models import CareEventRec
from app.domains.repository import now_utc

_CARE_COLUMNS = """
  id, dog_id, user_id, event_type, title, scheduled_at, all_day, timezone,
  location, notes, reminder_enabled, reminder_minutes_before, status,
  completed_at, reminder_sent_at, created_at, updated_at
"""


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _row_to_care(row: Any) -> CareEventRec:
    data = dict(row)
    data["id"] = str(data["id"])
    data["dog_id"] = str(data["dog_id"])
    data["user_id"] = str(data["user_id"])
    return CareEventRec.model_validate(data)


async def list_care_events(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    include_completed: bool = False,
) -> list[CareEventRec]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    status_clause = "" if include_completed else "and status = 'SCHEDULED'"
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    f"""
                    select {_CARE_COLUMNS}
                    from public.care_events
                    where dog_id = :dog_id
                      and user_id = :user_id
                      {status_clause}
                    order by scheduled_at asc, id asc
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()
    return [_row_to_care(row) for row in rows]


async def create_care_event(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    payload: CareEventCreate,
) -> CareEventRec:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    f"""
                    insert into public.care_events (
                      dog_id, user_id, event_type, title, scheduled_at, all_day,
                      timezone, location, notes, reminder_enabled,
                      reminder_minutes_before
                    ) values (
                      :dog_id, :user_id, :event_type, :title, :scheduled_at,
                      :all_day, :timezone, :location, :notes,
                      :reminder_enabled, :reminder_minutes_before
                    )
                    returning {_CARE_COLUMNS}
                    """
                ),
                {
                    "dog_id": dog_id,
                    "user_id": user_id,
                    "event_type": _enum_value(payload.event_type),
                    "title": payload.title,
                    "scheduled_at": payload.scheduled_at,
                    "all_day": payload.all_day,
                    "timezone": payload.timezone,
                    "location": payload.location,
                    "notes": payload.notes,
                    "reminder_enabled": payload.reminder_enabled,
                    "reminder_minutes_before": payload.reminder_minutes_before,
                },
            )
        ).mappings().first()
    return _row_to_care(row)


async def get_owned_care_event(
    engine: AsyncEngine,
    *,
    user_id: str,
    event_id: str,
) -> CareEventRec:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    f"""
                    select {_CARE_COLUMNS}
                    from public.care_events
                    where id = :event_id and user_id = :user_id
                    """
                ),
                {"event_id": event_id, "user_id": user_id},
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Care event not found")
    event = _row_to_care(row)
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=event.dog_id)
    return event


async def update_care_event(
    engine: AsyncEngine,
    *,
    user_id: str,
    event_id: str,
    payload: CareEventUpdate,
) -> CareEventRec:
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
    if not changes:
        return await get_owned_care_event(engine, user_id=user_id, event_id=event_id)

    for key in ("event_type", "status"):
        if key in changes:
            changes[key] = _enum_value(changes[key])
    if changes.get("status") == CareEventStatus.COMPLETED.value:
        changes["completed_at"] = now_utc()
    elif "status" in changes:
        changes["completed_at"] = None

    sets = ", ".join(f"{key} = :{key}" for key in changes)
    params = {"event_id": event_id, "user_id": user_id, **changes}
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    f"""
                    update public.care_events
                    set {sets}
                    where id = :event_id and user_id = :user_id
                    returning {_CARE_COLUMNS}
                    """
                ),
                params,
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Care event not found")
    event = _row_to_care(row)
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=event.dog_id)
    return event


async def delete_care_event(
    engine: AsyncEngine,
    *,
    user_id: str,
    event_id: str,
) -> None:
    await get_owned_care_event(engine, user_id=user_id, event_id=event_id)
    async with engine.begin() as conn:
        await conn.execute(
            text("delete from public.care_events where id = :event_id and user_id = :user_id"),
            {"event_id": event_id, "user_id": user_id},
        )


async def list_due_reminders(
    engine: AsyncEngine, *, limit: int = 100
) -> list[CareEventRec]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    f"""
                    select {_CARE_COLUMNS}
                    from public.care_events
                    where status = 'SCHEDULED'
                      and reminder_enabled
                      and reminder_sent_at is null
                      and scheduled_at
                            - make_interval(mins => reminder_minutes_before)
                          <= now()
                      and scheduled_at >= now() - interval '24 hours'
                    order by scheduled_at asc, id asc
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
        ).mappings().all()
    return [_row_to_care(row) for row in rows]


async def mark_reminder_sent(
    engine: AsyncEngine, *, event_id: str
) -> bool:
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                """
                update public.care_events
                set reminder_sent_at = now()
                where id = :event_id and reminder_sent_at is null
                """
            ),
            {"event_id": event_id},
        )
    return bool(result.rowcount)
