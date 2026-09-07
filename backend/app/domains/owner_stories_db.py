"""PostgreSQL persistence for confirmed owner-reported observations."""

from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import OwnerReportedFact
from app.contracts.errors import ApiError, ErrorCode
from app.domains import dogs_db
from app.domains.repository import new_id


def _uuid_id() -> str:
    value = new_id()
    return (
        f"{value[:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
        if len(value) == 32
        else value
    )


async def create_draft(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    transcript: str,
    facts: list[OwnerReportedFact],
) -> str:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    draft_id = _uuid_id()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                delete from public.owner_reported_observations
                where status = 'DRAFT' and draft_expires_at <= now()
                """
            )
        )
        await conn.execute(
            text(
                """
                insert into public.owner_reported_observations (
                  id, dog_id, user_id, transcript, facts_json, status
                ) values (
                  cast(:id as uuid), cast(:dog_id as uuid), cast(:user_id as uuid),
                  :transcript, cast(:facts as jsonb), 'DRAFT'
                )
                """
            ),
            {
                "id": draft_id,
                "dog_id": dog_id,
                "user_id": user_id,
                "transcript": transcript,
                "facts": json.dumps(
                    [fact.model_dump(mode="json") for fact in facts]
                ),
            },
        )
    return draft_id


async def confirm_draft(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    draft_id: str,
    facts: list[OwnerReportedFact],
) -> None:
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                """
                update public.owner_reported_observations
                set facts_json = cast(:facts as jsonb),
                    status = 'CONFIRMED',
                    confirmed_at = now()
                where id = cast(:id as uuid)
                  and dog_id = cast(:dog_id as uuid)
                  and user_id = cast(:user_id as uuid)
                  and status = 'DRAFT'
                  and draft_expires_at > now()
                """
            ),
            {
                "id": draft_id,
                "dog_id": dog_id,
                "user_id": user_id,
                "facts": json.dumps(
                    [fact.model_dump(mode="json") for fact in facts]
                ),
            },
        )
    if result.rowcount != 1:
        raise ApiError(ErrorCode.NOT_FOUND, "Owner story draft not found")
