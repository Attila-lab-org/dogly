"""PostgreSQL weight / BCS history."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.contracts.api import WeightEventCreate
from app.domains import dogs_db
from app.domains.ids import require_uuid
from app.domains.repository import new_id
from app.domains.weight_events import WeightEventRec


def _uuid_id() -> str:
    value = new_id()
    if len(value) == 32:
        return f"{value[:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
    return value


def _from_row(row) -> WeightEventRec:
    data = dict(row)
    data["id"] = str(data["id"])
    data["dog_id"] = str(data["dog_id"])
    data["user_id"] = str(data["user_id"])
    data["weight_kg"] = float(data["weight_kg"])
    return WeightEventRec.model_validate(data)


async def insert_weight_event_on_conn(
    conn: AsyncConnection,
    *,
    user_id: str,
    dog_id: str,
    weight_kg: float,
    body_condition_score: int | None = None,
    source: str = "OWNER",
    recorded_at: datetime | None = None,
) -> None:
    await conn.execute(
        text(
            """
            insert into public.dog_weight_events (
              id, dog_id, user_id, weight_kg, body_condition_score, source, recorded_at
            ) values (
              cast(:id as uuid), cast(:dog_id as uuid), cast(:user_id as uuid),
              :weight_kg, :body_condition_score, :source,
              coalesce(cast(:recorded_at as timestamptz), now())
            )
            """
        ),
        {
            "id": _uuid_id(),
            "dog_id": dog_id,
            "user_id": user_id,
            "weight_kg": weight_kg,
            "body_condition_score": body_condition_score,
            "source": source,
            "recorded_at": recorded_at,
        },
    )


async def create_weight_event(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    payload: WeightEventCreate,
) -> WeightEventRec:
    require_uuid(dog_id, not_found="Dog not found")
    dog = await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    event_id = _uuid_id()
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.dog_weight_events (
                      id, dog_id, user_id, weight_kg, body_condition_score, source, recorded_at
                    ) values (
                      cast(:id as uuid), cast(:dog_id as uuid), cast(:user_id as uuid),
                      :weight_kg, :body_condition_score, 'OWNER',
                      coalesce(cast(:recorded_at as timestamptz), now())
                    )
                    returning *
                    """
                ),
                {
                    "id": event_id,
                    "dog_id": dog.id,
                    "user_id": user_id,
                    "weight_kg": payload.weight_kg,
                    "body_condition_score": payload.body_condition_score,
                    "recorded_at": payload.recorded_at,
                },
            )
        ).mappings().one()
        await conn.execute(
            text(
                """
                update public.dogs
                set weight_kg = :weight_kg
                where id = cast(:dog_id as uuid) and owner_id = cast(:user_id as uuid)
                """
            ),
            {"weight_kg": payload.weight_kg, "dog_id": dog.id, "user_id": user_id},
        )
    return _from_row(row)


async def list_weight_events(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> list[WeightEventRec]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select *
                    from public.dog_weight_events
                    where dog_id = cast(:dog_id as uuid) and user_id = cast(:user_id as uuid)
                    order by recorded_at desc, created_at desc
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()
    return [_from_row(row) for row in rows]


async def nutrition_history_snapshot(
    engine: AsyncEngine, *, dog_id: str
) -> dict[str, object]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select weight_kg
                    from public.dog_weight_events
                    where dog_id = cast(:dog_id as uuid)
                    order by recorded_at asc
                    """
                ),
                {"dog_id": dog_id},
            )
        ).scalars().all()
    if not rows:
        return {"weight_points": 0, "latest_kg": None, "delta_kg": None}
    first = float(rows[0])
    latest = float(rows[-1])
    return {
        "weight_points": len(rows),
        "latest_kg": latest,
        "delta_kg": round(latest - first, 2) if len(rows) > 1 else None,
    }
