"""Sweep manuale: rimette in coda gli eventi di analisi bloccati.

Copre esattamente il buco lasciato dalla coda fake pre-fix: eventi salvati
come QUEUED (mai presi in carico) o FAILED_RETRYABLE (retry mai ridispacciato
in locale). Va eseguito come::

    cd backend && uv run python -m app.worker.sweep

In produzione non serve: Vercel Workflows ridispaccia davvero.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from sqlalchemy import text

if TYPE_CHECKING:
    from app.api.deps import AppState

logger = logging.getLogger(__name__)

# Stati "spenti" che giustificano una rispedizione: un evento in questi stati
# non ha nessun consumatore attivo né in arrivo.
STUCK_BEHAVIOR_STATUSES = ("QUEUED", "OBSERVING", "INTERPRETING", "FAILED_RETRYABLE")
STUCK_DIGESTIVE_STATUSES = ("QUEUED", "OBSERVING", "INTERPRETING", "FAILED_RETRYABLE")


async def _reserve_and_dispatch(
    state: AppState,
    *,
    event_id: str,
    domain: str,
) -> bool:
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


async def redispatch_stuck_events(state: AppState) -> dict[str, int]:
    """Rispedisce gli eventi bloccati e ritorna i conteggi per dominio."""
    counts = {"behavior": 0, "digestive": 0}
    if state.engine is None:
        logger.info("sweep: nessun engine configurato, nulla da fare")
        return counts
    async with state.engine.connect() as conn:
        behavior_rows = await conn.execute(
            text(
                "select id from public.behavior_events "
                "where status = any(:statuses) order by created_at"
            ),
            {"statuses": list(STUCK_BEHAVIOR_STATUSES)},
        )
        digestive_rows = await conn.execute(
            text(
                "select id from public.fecal_events "
                "where status = any(:statuses) order by created_at"
            ),
            {"statuses": list(STUCK_DIGESTIVE_STATUSES)},
        )
    for (event_id,) in behavior_rows.all():
        if await _reserve_and_dispatch(
            state,
            event_id=str(event_id),
            domain="BEHAVIOR",
        ):
            counts["behavior"] += 1
    for (event_id,) in digestive_rows.all():
        if await _reserve_and_dispatch(
            state,
            event_id=str(event_id),
            domain="DIGESTIVE",
        ):
            counts["digestive"] += 1
    logger.info("sweep completato: %s", counts)
    return counts


async def _run() -> dict[str, int]:
    from app.api.deps import build_default_state

    state = build_default_state()
    counts = await redispatch_stuck_events(state)
    # I dispatch girano in task di background: aspettiamo che la coda si
    # svuoti davvero prima di uscire, altrimenti asyncio.run li cancellerebbe.
    queue = state.queue
    if hasattr(queue, "wait_drained"):
        await queue.wait_drained()
    return counts


def main() -> None:
    counts = asyncio.run(_run())
    print(f"Rispediti — behavior: {counts['behavior']}, digestive: {counts['digestive']}")


if __name__ == "__main__":
    main()
