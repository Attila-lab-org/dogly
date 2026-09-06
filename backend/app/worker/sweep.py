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
        await state.queue.enqueue(
            task_type="behavior_analysis", payload={"event_id": event_id}
        )
        counts["behavior"] += 1
    for (event_id,) in digestive_rows.all():
        await state.queue.enqueue(
            task_type="digestive_analysis", payload={"event_id": event_id}
        )
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
