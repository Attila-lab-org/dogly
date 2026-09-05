"""Retention: TTL starts at terminal completion; cleanup deletes expired raw."""

from datetime import UTC, datetime, timedelta

import httpx

from app.contracts.taxonomy import RetentionState
from tests.conftest import create_dog


async def _queue_behavior_event(client, headers, crid: str) -> tuple[str, str]:
    dog_id = await create_dog(client, headers)
    r = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": dog_id,
            "client_request_id": crid,
            "duration_ms": 8000,
            "has_audio": True,
            "bytes": 1_000_000,
            "content_type": "video/mp4",
            "context_bucket": "HOME",
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    capture_id = body["capture_id"]
    c = await client.post(f"/v1/behavior/captures/{capture_id}/complete", headers=headers)
    assert c.status_code == 200, c.text
    return capture_id, c.json()["event_id"]


async def test_expires_at_none_until_terminal_completion(
    client: httpx.AsyncClient, worker_client: httpx.AsyncClient, auth_headers, state
):
    capture_id, event_id = await _queue_behavior_event(client, auth_headers, "crid-ttl-0001")
    capture = state.store.captures[capture_id]
    assert capture.expires_at is None

    resp = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "COMPLETED"
    assert capture.expires_at is not None
    assert capture.expires_at > datetime.now(UTC)


async def test_media_retention_cleanup_deletes_expired(
    client: httpx.AsyncClient, worker_client: httpx.AsyncClient, auth_headers, state
):
    capture_id, event_id = await _queue_behavior_event(client, auth_headers, "crid-ttl-0002")
    await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    capture = state.store.captures[capture_id]
    capture.expires_at = datetime.now(UTC) - timedelta(minutes=1)

    cleaned = await worker_client.post(
        "/tasks/run",
        json={"task_type": "media_retention_cleanup"},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert cleaned.status_code == 200, cleaned.text
    body = cleaned.json()
    assert body["deleted_behavior"] >= 1
    assert capture.retention_state == RetentionState.DELETED
