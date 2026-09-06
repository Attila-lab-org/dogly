"""Digestive transient failures persist and terminate at the retry cap."""

from __future__ import annotations

from app.worker.handlers import MAX_TASK_ATTEMPTS, process_digestive_event
from tests.conftest import create_dog


class TimeoutDigestiveVision:
    async def observe_stool(self, *, image_ref: str):
        del image_ref
        raise TimeoutError


async def test_digestive_timeout_reaches_terminal_state(
    client, auth_headers, state, user_id
):
    dog_id = await create_dog(client, auth_headers)
    init = await client.post(
        "/v1/digestive/fecal/init",
        headers={**auth_headers, "X-Idempotency-Key": "digestive-retry-init"},
        json={
            "dog_id": dog_id,
            "client_request_id": "digestive-retry-event",
            "bytes": 1_000,
            "content_type": "image/jpeg",
        },
    )
    assert init.status_code == 200, init.text
    event_id = init.json()["event_id"]
    path = init.json()["upload"]["storage_path"]
    state.storage.objects.add(("digestive-raw", path))
    complete = await client.post(
        f"/v1/digestive/fecal/{event_id}/complete",
        headers={**auth_headers, "X-Idempotency-Key": "digestive-retry-complete"},
    )
    assert complete.status_code == 200, complete.text
    state.digestive_vision = TimeoutDigestiveVision()

    for attempt in range(1, MAX_TASK_ATTEMPTS + 1):
        result = await process_digestive_event(state, event_id=event_id)
        expected = (
            "FAILED_RETRYABLE"
            if attempt < MAX_TASK_ATTEMPTS
            else "FAILED_TERMINAL"
        )
        assert result["status"] == expected
        assert state.store.fecal_events[event_id].attempt_count == attempt

    ledger = state.store.ensure_ledger(user_id)
    assert ledger.digestive_reserved == 0
    assert ledger.digestive_used == 0
