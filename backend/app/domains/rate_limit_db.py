"""DB-backed per-user rate limiting (audit sicurezza 2026-09-07).

Fixed window su Postgres: una riga per (user_id, bucket, finestra), upsert
atomico con returning. Le finestre vecchie vengono cancellate a ogni hit
(best-effort, indice su window_start).
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.errors import ApiError, ErrorCode


async def hit(
    engine: AsyncEngine,
    *,
    user_id: str,
    bucket: str,
    limit: int,
    window_seconds: int = 60,
) -> int:
    """Incrementa il contatore della finestra corrente e ritorna il valore.

    Superato `limit` alza ApiError(RATE_LIMITED) — il contatore continua a
    crescere, quindi una raffica non rientra nei limiti riprovando subito.
    """
    async with engine.begin() as conn:
        count = (
            await conn.execute(
                text(
                    """
                    insert into internal.rate_limits
                      (user_id, bucket, window_start, count)
                    values (
                      :uid, :bucket,
                      to_timestamp(
                        floor(extract(epoch from now()) / :win) * :win
                      ),
                      1
                    )
                    on conflict (user_id, bucket, window_start)
                      do update set count = rate_limits.count + 1
                    returning count
                    """
                ),
                {"uid": user_id, "bucket": bucket, "win": window_seconds},
            )
        ).scalar_one()
        await conn.execute(
            text(
                "delete from internal.rate_limits "
                "where window_start < now() - interval '2 hours'"
            )
        )
    if count > limit:
        raise ApiError(
            ErrorCode.RATE_LIMITED,
            "Troppe richieste in poco tempo. Riprova tra un minuto.",
        )
    return count
