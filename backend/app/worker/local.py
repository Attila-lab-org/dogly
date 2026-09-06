"""Dispatch in-process per la coda fake (JOB_QUEUE_BACKEND=fake, local dev).

In locale non esiste la piattaforma Vercel che riprova gli step falliti: il
dispatcher esegue l'handler in un task asyncio di background e replica il
backoff della piattaforma inline su ``RetryableTaskError`` (l'handler stesso
tappa ``MAX_TASK_ATTEMPTS`` tentativi, quindi il loop è sempre limitato).
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.api.deps import AppState

logger = logging.getLogger(__name__)


def make_local_dispatcher(state: AppState):
    """Restituisce un dispatcher ``(task_type, payload)`` per la coda fake.

    Copre i task di analisi (behavior/digestive): sono quelli che l'utente
    locale si aspetta di vedere smaltiti. Gli altri task type (privacy,
    notifiche push, retention) restano registrati nella coda senza dispatch:
    in locale mancano le piattaforme a valle (documentato, non un silenzio).
    """

    async def dispatch(task_type: str, payload: dict[str, str]) -> None:
        from app.worker import handlers

        handler = {
            "behavior_analysis": handlers.process_behavior_event,
            "digestive_analysis": handlers.process_digestive_event,
        }.get(task_type)
        if handler is None:
            logger.info("dispatch locale: task type %s non supportato, registrato solo", task_type)
            return
        event_id = payload.get("event_id")
        if not event_id:
            logger.info("dispatch locale: payload senza event_id per %s", task_type)
            return
        for attempt in range(1, handlers.MAX_TASK_ATTEMPTS + 1):
            try:
                await handler(state, event_id=event_id)
                return
            except handlers.RetryableTaskError:
                if attempt >= handlers.MAX_TASK_ATTEMPTS:
                    logger.exception(
                        "dispatch locale: %s %s terminale dopo %d tentativi",
                        task_type,
                        event_id,
                        attempt,
                    )
                    return
                # Backoff esponenziale con tetto, come la piattaforma.
                await asyncio.sleep(min(2**attempt, 30))

    return dispatch
