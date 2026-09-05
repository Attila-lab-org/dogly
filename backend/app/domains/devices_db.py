"""PostgreSQL repository for device installations."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def upsert_push_token(
    engine: AsyncEngine,
    user_id: str,
    platform: str,
    push_token: str,
    app_version: str | None,
) -> None:
    db_platform = platform.upper()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                insert into public.device_installations (
                  user_id, platform, push_token, app_version, last_seen
                ) values (
                  :user_id, :platform, :push_token, :app_version, now()
                )
                on conflict (user_id, platform, push_token) do update set
                  app_version = excluded.app_version,
                  last_seen = now(),
                  updated_at = now()
                """
            ),
            {
                "user_id": user_id,
                "platform": db_platform,
                "push_token": push_token,
                "app_version": app_version,
            },
        )
