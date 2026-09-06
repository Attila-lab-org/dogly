"""Idempotency tests (spec 9.1 / 22): duplicate client taps and duplicate
complete calls are safe."""

import httpx

from tests.conftest import create_dog


def _init_payload(dog_id: str, crid: str = "crid-00000001") -> dict:
    return {
        "dog_id": dog_id,
        "client_request_id": crid,
        "duration_ms": 8000,
        "has_audio": True,
        "bytes": 1_000_000,
        "content_type": "video/mp4",
        "context_bucket": "HOME",
    }


async def test_duplicate_init_returns_same_reservation(client: httpx.AsyncClient, auth_headers):
    dog_id = await create_dog(client, auth_headers)
    r1 = await client.post(
        "/v1/behavior/captures/init",
        json=_init_payload(dog_id),
        headers={**auth_headers, "X-Idempotency-Key": "idem-init-1"},
    )
    assert r1.status_code == 200, r1.text
    r2 = await client.post(
        "/v1/behavior/captures/init",
        json=_init_payload(dog_id),
        headers={**auth_headers, "X-Idempotency-Key": "idem-init-2"},
    )
    assert r2.status_code == 200, r2.text
    assert r1.json()["capture_id"] == r2.json()["capture_id"]
    assert r1.json()["event_id"] == r2.json()["event_id"]
    assert r2.json()["quota_reserved"] is False  # no double reservation


async def test_duplicate_complete_is_idempotent(client: httpx.AsyncClient, auth_headers, state):
    # Senza dispatcher la coda registra soltanto: il test misura l'idempotenza
    # dell'enqueue, non il processing (coperto da test_local_dispatch.py).
    state.queue.dispatcher = None
    dog_id = await create_dog(client, auth_headers)
    r = await client.post(
        "/v1/behavior/captures/init", json=_init_payload(dog_id, "crid-00000002"), headers=auth_headers
    )
    capture_id = r.json()["capture_id"]
    c1 = await client.post(f"/v1/behavior/captures/{capture_id}/complete", headers=auth_headers)
    assert c1.status_code == 200, c1.text
    assert c1.json()["status"] == "QUEUED"
    c2 = await client.post(f"/v1/behavior/captures/{capture_id}/complete", headers=auth_headers)
    assert c2.status_code == 200, c2.text
    assert c2.json()["status"] == "QUEUED"  # no second enqueue
    assert len([t for t in state.queue.tasks if t["task_type"] == "behavior_analysis"]) == 1


async def test_video_duration_limits(client: httpx.AsyncClient, auth_headers):
    dog_id = await create_dog(client, auth_headers)
    too_short = _init_payload(dog_id, "crid-00000003") | {"duration_ms": 1000}
    resp = await client.post("/v1/behavior/captures/init", json=too_short, headers=auth_headers)
    assert resp.status_code != 200
    assert resp.json()["code"] == "VIDEO_TOO_SHORT"
    too_long = _init_payload(dog_id, "crid-00000004") | {"duration_ms": 25_000}
    resp = await client.post("/v1/behavior/captures/init", json=too_long, headers=auth_headers)
    assert resp.json()["code"] == "VIDEO_TOO_LONG"
