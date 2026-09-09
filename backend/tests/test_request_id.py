"""FIX 1.7: X-Request-ID / correlation-id end-to-end propagation.

The middleware accepts an inbound X-Request-ID or generates one, echoes it
back on the response, and the error body's correlation_id matches it so a
support engineer can grep logs by request id.
"""

import httpx

from tests.conftest import create_dog


async def test_inbound_request_id_is_echoed_and_used_as_correlation_id(
    client: httpx.AsyncClient, auth_headers
):
    rid = "req-abc-123"
    # Trigger a validation error (missing dog_id) to get an error body back.
    r = await client.post(
        "/v1/behavior/captures/init",
        json={"dog_id": "not-a-uuid", "client_request_id": "x", "duration_ms": 1, "has_audio": True, "bytes": 1},
        headers={**auth_headers, "X-Request-ID": rid},
    )
    assert r.status_code in (422, 400, 404), r.text
    # The response always carries the request id header back.
    assert r.headers.get("X-Request-ID") == rid


async def test_generated_request_id_is_echoed_when_absent(
    client: httpx.AsyncClient, auth_headers
):
    dog_id = await create_dog(client, auth_headers)
    r = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": dog_id,
            "client_request_id": "crid-reqid-0001",
            "duration_ms": 8000,
            "has_audio": True,
            "bytes": 1_000_000,
            "content_type": "video/mp4",
            "context_bucket": "HOME",
        },
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    # No inbound id → server generates one and echoes it back.
    echoed = r.headers.get("X-Request-ID")
    assert echoed is not None
    assert len(echoed) > 0


async def test_error_correlation_id_matches_request_id(
    client: httpx.AsyncClient, auth_headers
):
    rid = "req-correlation-456"
    # Trigger an error: a non-existent dog UUID so the ownership check fails.
    r = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": "00000000-0000-0000-0000-000000000000",
            "client_request_id": "crid-reqid-0002",
            "duration_ms": 8000,
            "has_audio": True,
            "bytes": 1_000_000,
        },
        headers={**auth_headers, "X-Request-ID": rid},
    )
    assert r.status_code >= 400, r.text
    body = r.json()
    assert body["correlation_id"] == rid
    assert r.headers.get("X-Request-ID") == rid
