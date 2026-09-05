from __future__ import annotations

import httpx

from tests.conftest import create_dog


async def test_signals_map_and_experiment_update_personal_reaction(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    dog_id = await create_dog(client, auth_headers)

    initial = await client.get(f"/v1/dogs/{dog_id}/signals", headers=auth_headers)
    assert initial.status_code == 200
    assert len(initial.json()["items"]) == 4
    assert initial.json()["next_category"] in {"ATTENTION", "PLAY", "CONTACT", "CURIOSITY"}

    created = await client.post(
        f"/v1/dogs/{dog_id}/signals/experiments",
        headers={**auth_headers, "X-Idempotency-Key": "signals-attention-1"},
        json={
            "client_request_id": "signals-attention-1",
            "category": "ATTENTION",
            "sound_key": "attention-soft-01",
            "observed_behaviors": ["HEAD_TURN", "EAR_RAISE"],
            "reaction_latency_ms": 1320,
            "owner_feedback": "YES",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["category"] == "ATTENTION"
    assert body["status"] == "COMPLETED"
    assert body["owner_feedback"] == "YES"
    assert body["reaction_latency_ms"] == 1320
    assert body["result_summary"] == "Rocky ha girato la testa e ha alzato le orecchie."

    updated = await client.get(f"/v1/dogs/{dog_id}/signals", headers=auth_headers)
    attention = next(
        item for item in updated.json()["items"] if item["category"] == "ATTENTION"
    )
    assert attention["attempt_count"] == 1
    assert attention["confirm_count"] == 1
    assert attention["last_summary"] == "Rocky ha girato la testa e ha alzato le orecchie."


async def test_signals_reject_wrong_sound_category_pair(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    dog_id = await create_dog(client, auth_headers)

    created = await client.post(
        f"/v1/dogs/{dog_id}/signals/experiments",
        headers=auth_headers,
        json={
            "client_request_id": "signals-play-invalid-1",
            "category": "PLAY",
            "sound_key": "attention-soft-01",
            "observed_behaviors": ["HEAD_TURN"],
            "owner_feedback": "UNKNOWN",
        },
    )
    assert created.status_code == 422


async def test_signals_do_not_leak_other_users_dog(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    missing = await client.get("/v1/dogs/not-owned/signals", headers=auth_headers)
    assert missing.status_code == 404


async def test_signals_reject_no_response_mixed_with_visible_behavior(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    dog_id = await create_dog(client, auth_headers)
    response = await client.post(
        f"/v1/dogs/{dog_id}/signals/experiments",
        headers=auth_headers,
        json={
            "client_request_id": "signals-invalid-mixed-response",
            "category": "ATTENTION",
            "sound_key": "attention-soft-01",
            "observed_behaviors": ["NO_VISIBLE_RESPONSE", "HEAD_TURN"],
            "owner_feedback": "UNKNOWN",
        },
    )
    assert response.status_code == 422
