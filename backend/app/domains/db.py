"""SQLAlchemy 2 async engine factory (Spec V1 sez. 2).

Used only when DATABASE_URL is set (staging/production via Supabase pooler).
Schema is owned by Supabase migrations — this module never emits DDL.
Quota RPCs call public.reserve_usage / commit_usage / refund_usage
(migration 0006) with reference_id for idempotent cold-start-safe accounting.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import Settings

_engine: AsyncEngine | None = None


def _asyncpg_connect_args() -> dict[str, Any]:
    """Disable caches and use collision-free names for Supavisor transaction mode."""
    return {
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    }


def get_engine(settings: Settings) -> AsyncEngine | None:
    global _engine
    if not settings.database_url:
        return None
    if _engine is None:
        database_url = settings.database_url
        if database_url.startswith("postgres://"):
            database_url = database_url.replace(
                "postgres://",
                "postgresql+asyncpg://",
                1,
            )
        elif database_url.startswith("postgresql://"):
            database_url = database_url.replace(
                "postgresql://",
                "postgresql+asyncpg://",
                1,
            )
        # Supabase displays the password placeholder in square brackets.
        # Be forgiving when the value is replaced but the brackets are kept.
        database_url = re.sub(
            r":\[([^\]]+)\]@",
            r":\1@",
            database_url,
            count=1,
        )
        parts = urlsplit(database_url)
        asyncpg_query: list[tuple[str, str]] = []
        for key, value in parse_qsl(parts.query, keep_blank_values=True):
            if key == "sslmode":
                asyncpg_query.append(("ssl", value))
            elif key == "ssl":
                asyncpg_query.append((key, value))
            # Vercel/Supabase metadata such as `supa=base-pooler.x` is not
            # accepted by asyncpg and must not be forwarded to connect().
        database_url = urlunsplit(
            (
                parts.scheme,
                parts.netloc,
                parts.path,
                urlencode(asyncpg_query),
                parts.fragment,
            )
        )
        _engine = create_async_engine(
            database_url,
            connect_args=_asyncpg_connect_args(),
            poolclass=NullPool,
        )
    return _engine


async def reserve_usage_sql(
    engine: AsyncEngine,
    *,
    user_id: str,
    domain: str,
    reference_id: str,
    units: int = 1,
) -> dict[str, Any]:
    """Atomic quota reservation (sez. 7.3 / 22). Idempotent on reference_id."""
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT public.reserve_usage("
                "CAST(:user_id AS uuid), :domain, :reference_id, :units) AS payload"
            ),
            {
                "user_id": user_id,
                "domain": domain,
                "reference_id": reference_id,
                "units": units,
            },
        )
        row = result.mappings().first()
        payload = dict(row["payload"]) if row and row["payload"] is not None else {}
        return payload


async def commit_usage_sql(engine: AsyncEngine, *, reference_id: str) -> dict[str, Any]:
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT public.commit_usage(:reference_id) AS payload"),
            {"reference_id": reference_id},
        )
        row = result.mappings().first()
        return dict(row["payload"]) if row and row["payload"] is not None else {}


async def refund_usage_sql(
    engine: AsyncEngine, *, reference_id: str, reason: str | None = None
) -> dict[str, Any]:
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT public.refund_usage(:reference_id, :reason) AS payload"),
            {"reference_id": reference_id, "reason": reason},
        )
        row = result.mappings().first()
        return dict(row["payload"]) if row and row["payload"] is not None else {}
