"""SQLAlchemy 2 async engine factory (Spec V1 sez. 2).

Used only in environments with DATABASE_URL set (staging/production via the
Supabase pooler). The schema is owned by Supabase migrations — this module
never emits DDL. Quota operations call the internal.reserve_usage /
commit_usage / refund_usage functions (migration 0006) so reservation stays
atomic under row lock (sez. 7.3 / 22).
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.config import Settings

_engine: AsyncEngine | None = None


def get_engine(settings: Settings) -> AsyncEngine | None:
    global _engine
    if not settings.database_url:
        return None
    if _engine is None:
        _engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    return _engine


async def reserve_usage_sql(engine: AsyncEngine, *, user_id: str, domain: str) -> bool:
    """Atomic quota reservation via the DB function (sez. 7.3). Returns True
    when the reservation was granted."""
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT internal.reserve_usage(:user_id, :domain) AS granted"),
            {"user_id": user_id, "domain": domain},
        )
        row = result.mappings().first()
        return bool(row and row["granted"])


async def commit_usage_sql(engine: AsyncEngine, *, user_id: str, domain: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("SELECT internal.commit_usage(:user_id, :domain)"),
            {"user_id": user_id, "domain": domain},
        )


async def refund_usage_sql(engine: AsyncEngine, *, user_id: str, domain: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("SELECT internal.refund_usage(:user_id, :domain)"),
            {"user_id": user_id, "domain": domain},
        )
