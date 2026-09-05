"""PostgreSQL repository for account profiles."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domains.models import ProfileRec


def _row_to_profile(row: Any) -> ProfileRec:
    data = dict(row)
    data["user_id"] = str(data["user_id"])
    return ProfileRec.model_validate(data)


async def get_or_create_profile(engine: AsyncEngine, user_id: str) -> ProfileRec:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.profiles (user_id)
                    values (:user_id)
                    on conflict (user_id) do update set user_id = excluded.user_id
                    returning user_id, locale, timezone, created_at, deleted_at
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().first()
    return _row_to_profile(row)


async def is_account_deleted(engine: AsyncEngine, user_id: str) -> bool:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select deleted_at is not null as deleted
                    from public.profiles
                    where user_id = :user_id
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().first()
    return bool(row and row["deleted"])
