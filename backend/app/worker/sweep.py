"""Sweep eventi di analisi bloccati: ridispatch o chiusura terminale.

Copre il buco in cui Vercel uccide lo step e `already_running` torna 200:
l'evento resta QUEUED/OBSERVING/INTERPRETING/FAILED_RETRYABLE, la quota
RESERVED non torna, lo spinner gira per sempre.

Produzione: GET /tasks/cron/sweep-stuck (vercel.json, ogni 15 min).
Locale: ``cd backend && uv run python -m app.worker.sweep``
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import text

from app.domains.repository import now_utc
from app.worker.handlers import MAX_TASK_ATTEMPTS, fail_stuck_analysis

if TYPE_CHECKING:
    from app.api.deps import AppState

logger = logging.getLogger(__name__)

STUCK_BEHAVIOR_STATUSES = ("QUEUED", "OBSERVING", "INTERPRETING", "FAILED_RETRYABLE")
STUCK_DIGESTIVE_STATUSES = ("QUEUED", "OBSERVING", "INTERPRETING", "FAILED_RETRYABLE")
DEFAULT_LIMIT = 50
# Eventi più giovani di questa soglia sono ancora lavoro in corso.
REDISPATCH_AFTER_MINUTES = 15
# Oltre questa età (o MAX_TASK_ATTEMPTS) chiudiamo e rimborsiamo.
TERMINAL_AFTER_MINUTES = 30


async def _reserve_and_dispatch(
    state: AppState,
    *,
    event_id: str,
    domain: str,
) -> bool:
    if state.engine is None:
        return False
    task_type = f"{domain.lower()}_analysis"
    job_type = f"{domain}_ANALYSIS"
    async with state.engine.begin() as conn:
        reserved = (
            await conn.execute(
                text(
                    """
                    insert into internal.analysis_jobs (
                      job_type, domain, event_id, status
                    ) values (
                      :job_type, :domain, :event_id, 'PENDING'
                    )
                    on conflict (event_id) do update set
                      status = 'PENDING',
                      task_id = null,
                      last_error_code = null,
                      scheduled_at = now(),
                      started_at = null,
                      completed_at = null,
                      updated_at = now()
                    where internal.analysis_jobs.status in ('FAILED', 'COMPLETED')
                       or (
                         internal.analysis_jobs.status = 'PENDING'
                         and internal.analysis_jobs.task_id is null
                       )
                       or (
                         internal.analysis_jobs.status = 'RUNNING'
                         and internal.analysis_jobs.updated_at
                             < now() - interval '10 minutes'
                       )
                    returning id
                    """
                ),
                {
                    "job_type": job_type,
                    "domain": domain,
                    "event_id": event_id,
                },
            )
        ).first()
    if not reserved:
        return False

    try:
        task_id = await state.queue.enqueue(
            task_type=task_type,
            payload={"event_id": event_id},
        )
    except Exception:
        async with state.engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    update internal.analysis_jobs
                    set status = 'FAILED',
                        last_error_code = 'QUEUE_DISPATCH_FAILED',
                        completed_at = now(),
                        updated_at = now()
                    where event_id = :event_id and task_id is null
                    """
                ),
                {"event_id": event_id},
            )
        raise

    async with state.engine.begin() as conn:
        await conn.execute(
            text(
                """
                update internal.analysis_jobs
                set task_id = :task_id, updated_at = now()
                where event_id = :event_id
                """
            ),
            {"event_id": event_id, "task_id": task_id},
        )
    return True


def _empty_counts() -> dict[str, int]:
    return {
        "behavior": 0,
        "digestive": 0,
        "behavior_terminated": 0,
        "digestive_terminated": 0,
        "behavior_redispatched": 0,
        "digestive_redispatched": 0,
    }


def _should_terminate(created_at: Any, attempt_count: int, max_age: timedelta) -> bool:
    if int(attempt_count or 0) >= MAX_TASK_ATTEMPTS:
        return True
    if created_at is None:
        return False
    return now_utc() - created_at >= max_age


async def _list_stuck_db(
    state: AppState,
    *,
    limit: int,
    min_age_minutes: int,
) -> list[tuple[str, str, Any, int]]:
    async with state.engine.connect() as conn:
        behavior_rows = (
            await conn.execute(
                text(
                    """
                    select id, 'BEHAVIOR' as domain, created_at, attempt_count
                    from public.behavior_events
                    where status = any(:statuses)
                      and created_at <= now() - (:min_age * interval '1 minute')
                    order by created_at
                    limit :limit
                    """
                ),
                {
                    "statuses": list(STUCK_BEHAVIOR_STATUSES),
                    "min_age": min_age_minutes,
                    "limit": limit,
                },
            )
        ).all()
        remaining = max(limit - len(behavior_rows), 0)
        digestive_rows = (
            await conn.execute(
                text(
                    """
                    select id, 'DIGESTIVE' as domain, created_at, attempt_count
                    from public.fecal_events
                    where status = any(:statuses)
                      and created_at <= now() - (:min_age * interval '1 minute')
                    order by created_at
                    limit :limit
                    """
                ),
                {
                    "statuses": list(STUCK_DIGESTIVE_STATUSES),
                    "min_age": min_age_minutes,
                    "limit": remaining,
                },
            )
        ).all()
    return [*behavior_rows, *digestive_rows]


def _list_stuck_store(
    state: AppState,
    *,
    limit: int,
    min_age: timedelta,
) -> list[tuple[str, str, Any, int]]:
    store = getattr(state, "store", None)
    if store is None:
        return []
    now = now_utc()
    rows: list[tuple[str, str, Any, int]] = []
    for event in store.behavior_events.values():
        status = (
            event.status.value if hasattr(event.status, "value") else str(event.status)
        )
        if status not in STUCK_BEHAVIOR_STATUSES:
            continue
        if event.created_at is None or now - event.created_at < min_age:
            continue
        rows.append((event.id, "BEHAVIOR", event.created_at, event.attempt_count))
    for event in store.fecal_events.values():
        if event.status not in STUCK_DIGESTIVE_STATUSES:
            continue
        if event.created_at is None or now - event.created_at < min_age:
            continue
        rows.append((event.id, "DIGESTIVE", event.created_at, event.attempt_count))
    rows.sort(key=lambda item: item[2])
    return rows[:limit]


async def sweep_stuck_events(
    state: AppState,
    *,
    limit: int = DEFAULT_LIMIT,
    min_age_minutes: int = REDISPATCH_AFTER_MINUTES,
    max_age_minutes: int = TERMINAL_AFTER_MINUTES,
) -> dict[str, int]:
    """Ridispatcha i bloccati recenti; chiude e rimborsa quelli troppo vecchi."""
    counts = _empty_counts()
    max_age = timedelta(minutes=max_age_minutes)
    min_age = timedelta(minutes=min_age_minutes)

    if getattr(state, "engine", None) is not None:
        rows = await _list_stuck_db(
            state, limit=limit, min_age_minutes=min_age_minutes
        )
    else:
        rows = _list_stuck_store(state, limit=limit, min_age=min_age)

    for event_id, domain, created_at, attempt_count in rows:
        event_id = str(event_id)
        domain = str(domain)
        key = "behavior" if domain == "BEHAVIOR" else "digestive"
        if _should_terminate(created_at, int(attempt_count or 0), max_age):
            if await fail_stuck_analysis(state, event_id=event_id, domain=domain):
                counts[f"{key}_terminated"] += 1
            continue
        if await _reserve_and_dispatch(state, event_id=event_id, domain=domain):
            counts[key] += 1
            counts[f"{key}_redispatched"] += 1

    logger.info("sweep completato: %s", counts)
    return counts


async def redispatch_stuck_events(state: AppState) -> dict[str, int]:
    """Compat CLI/test: ritorna solo i conteggi di ridispatch."""
    result = await sweep_stuck_events(state)
    return {"behavior": result["behavior"], "digestive": result["digestive"]}


async def _run() -> dict[str, int]:
    from app.api.deps import build_default_state

    state = build_default_state()
    counts = await sweep_stuck_events(state)
    queue = state.queue
    if hasattr(queue, "wait_drained"):
        await queue.wait_drained()
    return counts


def main() -> None:
    counts = asyncio.run(_run())
    print(
        "Sweep — redispatched "
        f"behavior={counts['behavior_redispatched']} "
        f"digestive={counts['digestive_redispatched']}; "
        "terminated "
        f"behavior={counts['behavior_terminated']} "
        f"digestive={counts['digestive_terminated']}"
    )


if __name__ == "__main__":
    main()
