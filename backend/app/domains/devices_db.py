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


async def list_notification_tokens(
    engine: AsyncEngine, user_id: str
) -> list[str]:
    """Return recent tokens only when the latest notification consent is ON."""
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    with latest_consent as (
                      select granted
                      from public.user_consents
                      where user_id = cast(:user_id as uuid)
                        and consent_type = 'NOTIFICATIONS'
                      order by created_at desc, id desc
                      limit 1
                    )
                    select distinct d.push_token
                    from public.device_installations d
                    where d.user_id = cast(:user_id as uuid)
                      and d.last_seen >= now() - interval '120 days'
                      and coalesce((select granted from latest_consent), false)
                    """
                ),
                {"user_id": user_id},
            )
        ).scalars().all()
    return [str(token) for token in rows]
