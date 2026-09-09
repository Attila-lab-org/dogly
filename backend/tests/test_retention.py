"""Retention: TTL starts at terminal completion; cleanup deletes expired raw."""

from datetime import UTC, datetime, timedelta

import httpx

from app.contracts.taxonomy import RetentionState
from app.domains.models import BehaviorCaptureRec
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
    assert body["processed"] >= 1
    assert body["failed"] == 0
    assert body["skipped"] == 0
    assert capture.retention_state == RetentionState.DELETED


def _expired_capture(index: int, *, fail: bool = False) -> BehaviorCaptureRec:
    expired = datetime.now(UTC) - timedelta(minutes=5)
    return BehaviorCaptureRec(
        id=f"cap-iso-{index:02d}",
        dog_id="dog-iso",
        user_id="user-iso",
        client_request_id=f"crid-iso-{index:02d}",
        storage_path="videos/fail.mp4" if fail else f"videos/ok-{index:02d}.mp4",
        duration_ms=8000,
        created_at=expired,
        expires_at=expired,
        retention_state=RetentionState.TEMPORARY,
    )


async def test_retention_isolates_one_failed_object_among_twelve(
    worker_client: httpx.AsyncClient, state
):
    original_delete = state.storage.delete_object

    async def flaky_delete(*, bucket: str, path: str) -> None:
        if path.endswith("fail.mp4"):
            raise httpx.HTTPStatusError(
                "400 Bad Request",
                request=httpx.Request("DELETE", "https://storage.test/object"),
                response=httpx.Response(400),
            )
        await original_delete(bucket=bucket, path=path)

    state.storage.delete_object = flaky_delete  # type: ignore[method-assign]
    for index in range(12):
        capture = _expired_capture(index, fail=index == 0)
        state.store.captures[capture.id] = capture

    state.settings.cron_secret = "vercel-cron-secret"
    response = await worker_client.get(
        "/tasks/cron/retention",
        headers={"Authorization": "Bearer vercel-cron-secret"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["processed"] == 11
    assert body["failed"] == 1
    assert body["skipped"] == 0
    assert body["deleted_behavior"] == 11
    assert body["http_status"] == 200
    assert body["status"] == "ok"
    failed = state.store.captures["cap-iso-00"]
    assert failed.retention_state == RetentionState.TEMPORARY
    deleted = [
        capture
        for capture in state.store.captures.values()
        if capture.retention_state == RetentionState.DELETED
    ]
    assert len(deleted) == 11


async def test_retention_cron_is_500_only_when_every_object_fails(
    worker_client: httpx.AsyncClient, state
):
    async def always_fail(*, bucket: str, path: str) -> None:
        del bucket, path
        raise RuntimeError("storage down")

    state.storage.delete_object = always_fail  # type: ignore[method-assign]
    for index in range(3):
        capture = _expired_capture(index)
        state.store.captures[capture.id] = capture

    state.settings.cron_secret = "vercel-cron-secret"
    response = await worker_client.get(
        "/tasks/cron/retention",
        headers={"Authorization": "Bearer vercel-cron-secret"},
    )
    assert response.status_code == 500, response.text
    body = response.json()
    assert body["processed"] == 0
    assert body["failed"] == 3
    assert body["http_status"] == 500
    assert body["status"] == "failed"


async def test_retention_quarantines_after_three_consecutive_failures(
    worker_client: httpx.AsyncClient, state
):
    async def always_fail(*, bucket: str, path: str) -> None:
        del bucket, path
        raise RuntimeError("400 Bad Request")

    state.storage.delete_object = always_fail  # type: ignore[method-assign]
    capture = _expired_capture(0, fail=True)
    state.store.captures[capture.id] = capture
    state.settings.cron_secret = "vercel-cron-secret"
    headers = {"Authorization": "Bearer vercel-cron-secret"}

    for _ in range(3):
        response = await worker_client.get("/tasks/cron/retention", headers=headers)
        assert response.status_code == 500

    tracker = state.store.retention_delete_failures
    key = ("behavior-raw", "videos/fail.mp4")
    assert tracker[key]["consecutive"] == 3
    assert tracker[key]["quarantined"] is True

    fourth = await worker_client.get("/tasks/cron/retention", headers=headers)
    assert fourth.status_code == 200, fourth.text
    body = fourth.json()
    assert body["skipped"] == 1
    assert body["failed"] == 0
    assert body["processed"] == 0
    assert state.store.captures[capture.id].retention_state == RetentionState.TEMPORARY
