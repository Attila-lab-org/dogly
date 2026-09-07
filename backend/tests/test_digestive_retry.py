"""Digestive transient failures raise for platform retry and terminate at the
retry cap."""

from __future__ import annotations

import pytest

from app.worker.handlers import (
    MAX_TASK_ATTEMPTS,
    RetryableTaskError,
    process_digestive_event,
)
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

    for attempt in range(1, MAX_TASK_ATTEMPTS):
        with pytest.raises(RetryableTaskError) as exc_info:
            await process_digestive_event(state, event_id=event_id)
        assert exc_info.value.payload["status"] == "FAILED_RETRYABLE"
        assert exc_info.value.payload["error"] == "PROVIDER_TIMEOUT"
        assert state.store.fecal_events[event_id].attempt_count == attempt

    result = await process_digestive_event(state, event_id=event_id)
    assert result["status"] == "FAILED_TERMINAL"
    assert state.store.fecal_events[event_id].attempt_count == MAX_TASK_ATTEMPTS

    ledger = state.store.ensure_ledger(user_id)
    assert ledger.digestive_reserved == 0
    assert ledger.digestive_used == 0
