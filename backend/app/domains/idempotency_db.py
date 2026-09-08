"""Persistent idempotency store (X-Idempotency-Key) for staging/production."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.errors import ApiError, ErrorCode


async def claim(
    engine: AsyncEngine, *, scope: str, payload_hash: str | None
) -> dict[str, Any] | None:
    """Atomically claim a key. None means this request owns the work.

    Returns a cached body when a previous request already completed.
    Raises if the key is in flight or reused with a different payload.
    """
    async with engine.begin() as conn:
        inserted = (
            await conn.execute(
                text(
                    """
                    insert into internal.api_idempotency (
                      scope, status_code, response_body, payload_hash
                    ) values (
                      :scope, 0, '{}'::jsonb, :payload_hash
                    )
                    on conflict (scope) do nothing
                    returning scope
                    """
                ),
                {"scope": scope, "payload_hash": payload_hash},
            )
        ).mappings().first()
        if inserted:
            return None
        row = (
            await conn.execute(
                text(
                    """
                    select status_code, response_body, payload_hash
                    from internal.api_idempotency
                    where scope = :scope
                    """
                ),
                {"scope": scope},
            )
        ).mappings().one()
    stored_hash = row["payload_hash"]
    if payload_hash and stored_hash not in (None, payload_hash):
        raise ApiError(
            ErrorCode.IDEMPOTENCY_CONFLICT,
            "Idempotency key was reused with a different payload.",
        )
    if int(row["status_code"] or 0) == 200:
        body = dict(row["response_body"] or {})
        return {k: v for k, v in body.items() if k != "__payload_hash__"}
    raise ApiError(
        ErrorCode.RATE_LIMITED,
        "This request is already being processed. Retry shortly.",
        retryable=True,
    )


async def lookup(
    engine: AsyncEngine, *, scope: str, payload_hash: str | None
) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select status_code, response_body, payload_hash
                    from internal.api_idempotency
                    where scope = :scope
                    """
                ),
                {"scope": scope},
            )
        ).mappings().first()
    if not row:
        return None
    stored_hash = row["payload_hash"]
    if payload_hash and stored_hash not in (None, payload_hash):
        raise ApiError(
            ErrorCode.IDEMPOTENCY_CONFLICT,
            "Idempotency key was reused with a different payload.",
        )
    if int(row["status_code"] or 0) != 200:
        return None
    body = dict(row["response_body"] or {})
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
                  status_code = 200,
                  response_body = excluded.response_body,
                  payload_hash = excluded.payload_hash
                """
            ),
            {"scope": scope, "body": json.dumps(stored), "payload_hash": payload_hash},
        )
