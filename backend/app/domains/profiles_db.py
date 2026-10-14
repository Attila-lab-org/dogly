"""PostgreSQL repository for account profiles."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import ProfilePatch
from app.domains.models import ProfileRec

_PROFILE_COLUMNS = (
    "user_id, display_name, locale, timezone, ask_voice_gender, created_at, deleted_at"
)


def _row_to_profile(row: Any) -> ProfileRec:
    data = dict(row)
    data["user_id"] = str(data["user_id"])
    gender = str(data.get("ask_voice_gender") or "FEMALE").upper()
    data["ask_voice_gender"] = gender if gender in {"FEMALE", "MALE"} else "FEMALE"
    return ProfileRec.model_validate(data)


async def get_or_create_profile(engine: AsyncEngine, user_id: str) -> ProfileRec:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    f"""
                    insert into public.profiles (user_id)
                    values (:user_id)
                    on conflict (user_id) do update set user_id = excluded.user_id
                    returning {_PROFILE_COLUMNS}
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().first()
    return _row_to_profile(row)


async def update_profile(
    engine: AsyncEngine, user_id: str, payload: ProfilePatch
) -> ProfileRec:
    requested = payload.model_dump(exclude_unset=True)
    if not requested:
        return await get_or_create_profile(engine, user_id)

    sets: list[str] = []
    params: dict[str, Any] = {"user_id": user_id}
    if "display_name" in requested:
        sets.append("display_name = :display_name")
        params["display_name"] = requested["display_name"]
    if "ask_voice_gender" in requested and requested["ask_voice_gender"] is not None:
        sets.append("ask_voice_gender = :ask_voice_gender")
        params["ask_voice_gender"] = requested["ask_voice_gender"]

    if not sets:
        return await get_or_create_profile(engine, user_id)

    insert_cols = ["user_id"]
    insert_vals = [":user_id"]
    if "display_name" in params:
        insert_cols.append("display_name")
        insert_vals.append(":display_name")
    if "ask_voice_gender" in params:
        insert_cols.append("ask_voice_gender")
        insert_vals.append(":ask_voice_gender")

    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    f"""
                    insert into public.profiles ({", ".join(insert_cols)})
                    values ({", ".join(insert_vals)})
                    on conflict (user_id) do update
                      set {", ".join(sets)}
                    returning {_PROFILE_COLUMNS}
                    """
                ),
                params,
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
