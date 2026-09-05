"""Persistent idempotency store (X-Idempotency-Key) for staging/production."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.errors import ApiError, ErrorCode


async def lookup(
    engine: AsyncEngine, *, scope: str, payload_hash: str | None
) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    "select response_body, payload_hash from internal.api_idempotency where scope = :scope"
                ),
                {"scope": scope},
            )
        ).mappings().first()
    if not row:
        return None
    stored_hash = row["payload_hash"]
    body = dict(row["response_body"] or {})
    if payload_hash and stored_hash not in (None, payload_hash):
        raise ApiError(
            ErrorCode.IDEMPOTENCY_CONFLICT,
            "Idempotency key was reused with a different payload.",
        )
    return {k: v for k, v in body.items() if k != "__payload_hash__"}


async def record(
    engine: AsyncEngine,
    *,
    scope: str,
    body: dict[str, Any],
    payload_hash: str | None,
) -> None:
    stored = dict(body)
    if payload_hash:
        stored["__payload_hash__"] = payload_hash
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                insert into internal.api_idempotency (scope, status_code, response_body, payload_hash)
                values (:scope, 200, CAST(:body AS jsonb), :payload_hash)
                on conflict (scope) do update set
                  response_body = excluded.response_body,
                  payload_hash = excluded.payload_hash
                """
            ),
            {"scope": scope, "body": __import__("json").dumps(stored), "payload_hash": payload_hash},
        )
