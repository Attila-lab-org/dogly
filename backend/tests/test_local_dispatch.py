"""Test per il dispatch in-process della coda fake (local dev)."""

from __future__ import annotations

import asyncio

import pytest
from app.providers.mock import InMemoryJobQueue
from app.worker import handlers
from app.worker.local import make_local_dispatcher
from app.worker.sweep import redispatch_stuck_events


class FakeState:
    """Stub minimo per make_local_dispatcher: registra le chiamate ai task."""


@pytest.mark.asyncio
async def test_enqueue_without_dispatcher_only_records() -> None:
    queue = InMemoryJobQueue()
    await queue.enqueue(task_type="behavior_analysis", payload={"event_id": "e1"})
    assert len(queue.tasks) == 1
    assert queue.tasks[0]["payload"] == {"event_id": "e1"}


@pytest.mark.asyncio
async def test_enqueue_with_dispatcher_dispatches_in_background() -> None:
    queue = InMemoryJobQueue()
    done = asyncio.Event()
    calls: list[tuple[str, dict[str, str]]] = []

    async def dispatcher(task_type: str, payload: dict[str, str]) -> None:
        calls.append((task_type, payload))
        done.set()

    queue.dispatcher = dispatcher
    await queue.enqueue(task_type="behavior_analysis", payload={"event_id": "e1"})
    await asyncio.wait_for(done.wait(), timeout=1)
    assert calls == [("behavior_analysis", {"event_id": "e1"})]


@pytest.mark.asyncio
async def test_dispatcher_retry_inline_on_retryable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(handlers, "MAX_TASK_ATTEMPTS", 3)
    # Attenzione: app.worker.local fa `import asyncio`, quindi il target del
    # monkeypatch È asyncio.sleep globale: catturare l'originale PRIMA, altrimenti
    # il lambda richiama se stesso all'infinito.
    real_sleep = asyncio.sleep
    monkeypatch.setattr(
        "app.worker.local.asyncio.sleep", lambda _s: real_sleep(0)
    )
    calls = {"n": 0}

    async def fake_handler(state: FakeState, *, event_id: str) -> dict:
        calls["n"] += 1
        if calls["n"] == 1:
            raise handlers.RetryableTaskError(
                {"event_id": event_id, "status": "FAILED_RETRYABLE", "error": "X"}
            )
        return {"event_id": event_id, "status": "COMPLETED"}

    monkeypatch.setattr(handlers, "process_behavior_event", fake_handler)
    dispatch = make_local_dispatcher(FakeState())
    await dispatch("behavior_analysis", {"event_id": "e1"})
    assert calls["n"] == 2  # primo tentativo fallito retryable, secondo ok


@pytest.mark.asyncio
async def test_dispatcher_stops_after_max_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(handlers, "MAX_TASK_ATTEMPTS", 2)
    real_sleep = asyncio.sleep
    monkeypatch.setattr(
        "app.worker.local.asyncio.sleep", lambda _s: real_sleep(0)
    )
    calls = {"n": 0}

    async def fake_handler(state: FakeState, *, event_id: str) -> dict:
        calls["n"] += 1
        raise handlers.RetryableTaskError(
            {"event_id": event_id, "status": "FAILED_RETRYABLE", "error": "X"}
        )

    monkeypatch.setattr(handlers, "process_behavior_event", fake_handler)
    dispatch = make_local_dispatcher(FakeState())
    await dispatch("behavior_analysis", {"event_id": "e1"})  # non deve sollevare
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_dispatcher_skips_unknown_task_types() -> None:
    dispatch = make_local_dispatcher(FakeState())
    # Nessun handler: deve ritornare senza errori né chiamate.
    await dispatch("privacy_export", {"event_id": "e1"})


@pytest.mark.asyncio
async def test_sweep_without_engine_is_noop() -> None:
    state = FakeState()
    state.engine = None
    counts = await redispatch_stuck_events(state)
    assert counts == {"behavior": 0, "digestive": 0}
