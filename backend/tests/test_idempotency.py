"""Idempotency tests (spec 9.1 / 22): duplicate client taps and duplicate
complete calls are safe."""

import asyncio

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


async def test_local_dispatch_sees_job_reserved_before_worker_starts(
    client: httpx.AsyncClient,
    auth_headers,
    state,
):
    dispatched = asyncio.Event()
    saw_reserved_job = False

    async def dispatcher(_task_type: str, payload: dict[str, str]) -> None:
        nonlocal saw_reserved_job
        saw_reserved_job = any(
            job.event_id == payload["event_id"]
            for job in state.store.analysis_jobs.values()
        )
        dispatched.set()

    state.queue.dispatcher = dispatcher
    dog_id = await create_dog(client, auth_headers)
    initialized = await client.post(
        "/v1/behavior/captures/init",
        json=_init_payload(dog_id, "crid-job-before-dispatch"),
        headers=auth_headers,
    )
    completed = await client.post(
        f"/v1/behavior/captures/{initialized.json()['capture_id']}/complete",
        headers=auth_headers,
    )
    assert completed.status_code == 200, completed.text
    await asyncio.wait_for(dispatched.wait(), timeout=1)
    assert saw_reserved_job is True


async def test_video_duration_limits(client: httpx.AsyncClient, auth_headers):
    dog_id = await create_dog(client, auth_headers)
    too_short = _init_payload(dog_id, "crid-00000003") | {"duration_ms": 1000}
    resp = await client.post("/v1/behavior/captures/init", json=too_short, headers=auth_headers)
    assert resp.status_code != 200
    assert resp.json()["code"] == "VIDEO_TOO_SHORT"
    too_long = _init_payload(dog_id, "crid-00000004") | {"duration_ms": 25_000}
    resp = await client.post("/v1/behavior/captures/init", json=too_long, headers=auth_headers)
    assert resp.json()["code"] == "VIDEO_TOO_LONG"


async def test_stale_inflight_idempotency_key_is_reclaimed(client, auth_headers, state):
    """FIX 1.4: an in-flight claim (status_code=0) that never reached record()
    is reclaimed after the TTL instead of 429ing the key forever."""
    from datetime import timedelta

    import jwt as pyjwt

    from app.domains.models import IdempotencyRec
    from app.domains.repository import now_utc

    dog_id = await create_dog(client, auth_headers)
    token = auth_headers["Authorization"].split(" ", 1)[1]
    sub = pyjwt.decode(token, options={"verify_signature": False})["sub"]
    real_scope = f"{sub}:/v1/behavior/captures/init:idem-stale"
    state.store.idempotency[real_scope] = IdempotencyRec(
        scope=real_scope,
        status_code=0,
        response_body={},
        created_at=now_utc() - timedelta(minutes=11),
    )
    # A fresh retry with the same key must now succeed (reclaim), not 429.
    r = await client.post(
        "/v1/behavior/captures/init",
        json=_init_payload(dog_id, "crid-stale-0001"),
        headers={**auth_headers, "X-Idempotency-Key": "idem-stale"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["capture_id"]


async def test_fresh_inflight_idempotency_key_still_blocks(client, auth_headers, state):
    """A recent in-flight claim (within the TTL) still 429s — the TTL only
    reclaims stale claims, not live ones."""
    from datetime import timedelta

    import jwt as pyjwt

    from app.domains.models import IdempotencyRec
    from app.domains.repository import now_utc

    dog_id = await create_dog(client, auth_headers)
    token = auth_headers["Authorization"].split(" ", 1)[1]
    sub = pyjwt.decode(token, options={"verify_signature": False})["sub"]
    real_scope = f"{sub}:/v1/behavior/captures/init:idem-fresh"
    state.store.idempotency[real_scope] = IdempotencyRec(
        scope=real_scope,
        status_code=0,
        response_body={},
        created_at=now_utc() - timedelta(seconds=30),
    )
    r = await client.post(
        "/v1/behavior/captures/init",
        json=_init_payload(dog_id, "crid-fresh-0001"),
        headers={**auth_headers, "X-Idempotency-Key": "idem-fresh"},
    )
    assert r.status_code == 429
    assert r.json()["code"] == "RATE_LIMITED"


async def test_unhandled_error_releases_inflight_idempotency_key(
    state, auth_headers, monkeypatch
):
    from app.api.app import create_app
    from app.domains import digestive

    app = create_app(state)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        dog_id = await create_dog(client, auth_headers)

        original = digestive.create_manual_food_product

        def boom(*_args, **_kwargs):
            raise RuntimeError("manual food insert failed")

        monkeypatch.setattr(digestive, "create_manual_food_product", boom)
        payload = {
            "dog_id": dog_id,
            "client_request_id": "manual-food-500-retry",
            "name": "Crocchette prova",
        }
        headers = {**auth_headers, "X-Idempotency-Key": "manual-food-500-retry"}
        first = await client.post("/v1/nutrition/foods/manual", json=payload, headers=headers)
        assert first.status_code == 500
        assert first.json()["retryable"] is True

        monkeypatch.setattr(digestive, "create_manual_food_product", original)
        second = await client.post("/v1/nutrition/foods/manual", json=payload, headers=headers)
        assert second.status_code == 201, second.text
        assert second.json()["name"] == "Crocchette prova"
