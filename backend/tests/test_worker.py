"""Worker end-to-end tests (spec 7.2 / 8.2 / 22): queued -> observing ->
interpreting -> completed with mock providers; idempotent redelivery; quota
commit/refund semantics; internal auth on workflow routes."""

import httpx

from tests.conftest import create_dog


async def _queue_behavior_event(client, headers, crid: str) -> str:
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
    capture_id = r.json()["capture_id"]
    c = await client.post(f"/v1/behavior/captures/{capture_id}/complete", headers=headers)
    assert c.status_code == 200, c.text
    return c.json()["event_id"]


async def test_behavior_event_completes_end_to_end(
    client: httpx.AsyncClient, worker_client: httpx.AsyncClient, auth_headers, state, user_id
):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-e2e-0001")

    resp = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "COMPLETED"

    event = await client.get(f"/v1/behavior/events/{event_id}", headers=auth_headers)
    body = event.json()
    assert body["status"] == "COMPLETED"
    assert body["confidence_band"] in ("LOW", "MEDIUM", "HIGH")
    assert body["summary"]
    assert 1 <= len(body["evidence"]) <= 5

    # Quota committed exactly once.
    ledger = state.store.ensure_ledger(user_id)
    assert ledger.behavior_used == 1 and ledger.behavior_reserved == 0

    # Cost telemetry recorded for both provider calls (spec 25.1).
    ops = [r["operation"] for r in state.cost_meter.records]
    assert "observer.observe" in ops and "reasoner.interpret" in ops


async def test_worker_duplicate_delivery_is_noop(worker_client: httpx.AsyncClient, client, auth_headers):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-e2e-0002")
    headers = {"x-internal-token": "test-internal-token"}
    r1 = await worker_client.post(
        "/tasks/run", json={"task_type": "behavior_analysis", "event_id": event_id}, headers=headers
    )
    r2 = await worker_client.post(
        "/tasks/run", json={"task_type": "behavior_analysis", "event_id": event_id}, headers=headers
    )
    assert r1.json()["status"] == "COMPLETED"
    assert r2.json().get("noop") is True


async def test_worker_rejects_missing_or_wrong_internal_token(worker_client: httpx.AsyncClient):
    r = await worker_client.post("/tasks/run", json={"task_type": "behavior_analysis", "event_id": "x"})
    assert r.status_code in (401, 403)
    r2 = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": "x"},
        headers={"x-internal-token": "wrong"},
    )
    assert r2.status_code in (401, 403)


async def test_worker_unknown_event_acknowledged(worker_client: httpx.AsyncClient):
    r = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": "evt-unknown"},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "ignored_unknown_event"
