"""Rate limiting per-utente (audit sicurezza 2026-09-07): finestre fisse sui
POST costosi; superato il limite → 429 RATE_LIMITED senza eseguire l'handler."""

import httpx
import pytest

from app.api import deps
from tests.conftest import create_dog, make_token


@pytest.fixture(autouse=True)
def fixed_rate_limit_window(monkeypatch):
    """A test run crossing a wall-clock minute must not split the requests."""
    monkeypatch.setattr(deps, "_rate_limit_window", lambda _seconds: 12345)


def _init_payload(dog_id: str, crid: str) -> dict:
    return {
        "dog_id": dog_id,
        "client_request_id": crid,
        "duration_ms": 8000,
        "has_audio": True,
        "bytes": 1_000_000,
        "content_type": "video/mp4",
        "context_bucket": "HOME",
    }


async def test_push_token_limit_returns_429(client: httpx.AsyncClient, auth_headers):
    last = None
    for i in range(11):
        last = await client.post(
            "/v1/devices/push-token",
            json={
                "platform": "ios",
                "push_token": f"expo-push-token-{i:02d}-abcdefghij",
            },
            headers=auth_headers,
        )
    assert last is not None
    assert last.status_code == 429, last.text
    body = last.json()
    assert body["code"] == "RATE_LIMITED"
    assert body["retryable"] is True


async def test_feedback_limit_returns_429(
    client: httpx.AsyncClient, auth_headers, state
):
    state.queue.dispatcher = None  # enqueue only, niente processing
    dog_id = await create_dog(client, auth_headers)
    init = await client.post(
        "/v1/behavior/captures/init",
        json=_init_payload(dog_id, "crid-rate-feedback"),
        headers=auth_headers,
    )
    assert init.status_code == 200, init.text
    capture_id = init.json()["capture_id"]
    complete = await client.post(
        f"/v1/behavior/captures/{capture_id}/complete", headers=auth_headers
    )
    assert complete.status_code == 200, complete.text
    event_id = complete.json()["event_id"]

    last = None
    for _ in range(61):
        last = await client.post(
            f"/v1/behavior/events/{event_id}/feedback",
            json={"value": "YES"},
            headers=auth_headers,
        )
    assert last is not None
    assert last.status_code == 429, last.text
    assert last.json()["code"] == "RATE_LIMITED"


async def test_limit_is_per_user_not_global(
    client: httpx.AsyncClient, auth_headers, rsa_keys
):
    # L'utente A esaurisce il bucket; l'utente B resta servito (finestra nuova).
    for i in range(11):
        await client.post(
            "/v1/devices/push-token",
            json={
                "platform": "android",
                "push_token": f"expo-user-a-{i:02d}-abcdefghij",
            },
            headers=auth_headers,
        )
    other_headers = {
        "Authorization": f"Bearer {make_token(rsa_keys[0], sub='11111111-2222-4333-8444-555555555555')}"
    }
    r = await client.post(
        "/v1/devices/push-token",
        json={"platform": "ios", "push_token": "expo-user-b-00-abcdefghij"},
        headers=other_headers,
    )
    assert r.status_code == 200, r.text
