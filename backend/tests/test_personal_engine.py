"""Personal Engine: patterns need repeated evidence; knowledge score is derived."""

from app.contracts.taxonomy import PatternState
from app.domains.models import PersonalPatternRec
from app.domains.personal_engine import derive_pattern_state
from app.domains.repository import new_id, now_utc
from tests.conftest import create_dog


def test_pattern_state_never_establishes_from_one_event():
    assert derive_pattern_state(1, 0) is None
    assert derive_pattern_state(2, 0) == PatternState.CANDIDATE
    assert derive_pattern_state(4, 0) == PatternState.PRELIMINARY
    assert derive_pattern_state(8, 0) == PatternState.PRELIMINARY
    assert derive_pattern_state(8, 1) == PatternState.ESTABLISHED


async def test_two_completed_events_create_candidate_pattern(
    client, worker_client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    for index in range(2):
        init = await client.post(
            "/v1/behavior/captures/init",
            json={
                "dog_id": dog_id,
                "client_request_id": f"crid-pattern-{index:04d}",
                "duration_ms": 8000,
                "has_audio": True,
                "bytes": 1_000_000,
                "content_type": "video/mp4",
                "context_bucket": "HOME",
            },
            headers=auth_headers,
        )
        assert init.status_code == 200, init.text
        complete = await client.post(
            f"/v1/behavior/captures/{init.json()['capture_id']}/complete",
            headers=auth_headers,
        )
        assert complete.status_code == 200, complete.text
        event_id = complete.json()["event_id"]
        worker = await worker_client.post(
            "/tasks/run",
            json={"task_type": "behavior_analysis", "event_id": event_id},
            headers={"x-internal-token": "test-internal-token"},
        )
        assert worker.status_code == 200, worker.text
        assert worker.json()["status"] == "COMPLETED"

    patterns = [
        pattern
        for pattern in state.store.patterns.values()
        if pattern.dog_id == dog_id
    ]
    assert len(patterns) == 1
    assert patterns[0].state == PatternState.CANDIDATE
    assert patterns[0].support_count == 2
    assert patterns[0].title == "Cerca spesso il gioco"

    score = await client.get(
        f"/v1/dogs/{dog_id}/knowledge-score", headers=auth_headers
    )
    assert score.status_code == 200
    body = score.json()
    assert body["score"] is not None
    assert body["score"] > 0
    assert "usable_volume" in body["components"]
    assert "context_diversity" in body["components"]
    assert "temporal_diversity" in body["components"]
    assert "modality_quality" in body["components"]
    assert "pattern_consistency" in body["components"]
    assert "owner_validation" in body["components"]
    assert "digestive" not in body["components"]

    feedback = await client.post(
        f"/v1/behavior/events/{event_id}/feedback",
        json={"value": "YES"},
        headers={
            **auth_headers,
            "X-Idempotency-Key": "pattern-feedback-confirmation",
        },
    )
    assert feedback.status_code == 200, feedback.text
    assert patterns[0].confirm_count == 1
    refreshed = await client.get(
        f"/v1/dogs/{dog_id}/knowledge-score",
        headers=auth_headers,
    )
    assert refreshed.json()["components"]["owner_validation"] > 0


async def test_single_completion_does_not_create_pattern(
    client, worker_client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    init = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": dog_id,
            "client_request_id": "crid-pattern-single",
            "duration_ms": 8000,
            "has_audio": True,
            "bytes": 1_000_000,
            "content_type": "video/mp4",
            "context_bucket": "HOME",
        },
        headers=auth_headers,
    )
    complete = await client.post(
        f"/v1/behavior/captures/{init.json()['capture_id']}/complete",
        headers=auth_headers,
    )
    event_id = complete.json()["event_id"]
    await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert not any(p.dog_id == dog_id for p in state.store.patterns.values())


async def test_owner_confirmation_promotes_supported_pattern(
    client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    pattern_id = new_id()
    state.store.patterns[pattern_id] = PersonalPatternRec(
        id=pattern_id,
        dog_id=dog_id,
        title="Cerca spesso il gioco",
        state=PatternState.PRELIMINARY,
        support_count=8,
        confirm_count=0,
        reliability_band="medium",
        first_seen=now_utc(),
        last_seen=now_utc(),
    )

    response = await client.post(
        f"/v1/patterns/{pattern_id}/review",
        json={"action": "confirm"},
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["state"] == PatternState.ESTABLISHED
    assert state.store.patterns[pattern_id].confirm_count == 1
