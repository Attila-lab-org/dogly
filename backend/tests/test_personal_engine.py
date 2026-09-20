"""Personal Engine: patterns need repeated evidence; knowledge score is derived."""

from datetime import UTC, datetime

from app.contracts.taxonomy import ConfidenceBand, IntentCode, PatternState
from app.domains.models import BehaviorEventRec, PersonalPatternRec
from app.domains.personal_engine import (
    derive_pattern_state,
    is_behavior_learning_eligible,
    on_behavior_completed,
    semantic_pattern_similarity,
)
from app.domains.repository import new_id, now_utc

from tests.conftest import create_dog


def _learning_event(**updates) -> BehaviorEventRec:
    payload = {
        "id": "evt-learn-1",
        "capture_id": "cap-learn-1",
        "dog_id": "dog-learn-1",
        "user_id": "user-learn-1",
        "created_at": datetime.now(UTC),
        "primary_intent": IntentCode.PLAY_INTERACTION,
        "confidence_band": ConfidenceBand.HIGH,
        "observation_json": {"capture_quality": {"overall_quality": "good"}},
    }
    payload.update(updates)
    return BehaviorEventRec.model_validate(payload)


def test_low_confidence_is_not_learning_eligible():
    assert is_behavior_learning_eligible(_learning_event()) is True
    assert (
        is_behavior_learning_eligible(
            _learning_event(confidence_band=ConfidenceBand.LOW)
        )
        is False
    )


def test_degraded_video_is_not_learning_eligible():
    assert (
        is_behavior_learning_eligible(
            _learning_event(
                observation_json={"capture_quality": {"overall_quality": "degraded"}}
            )
        )
        is False
    )


async def test_low_confidence_event_does_not_write_pattern_signature(state):
    event = _learning_event(confidence_band=ConfidenceBand.LOW)
    state.store.behavior_events[event.id] = event
    await on_behavior_completed(state, event)
    assert event.id not in state.store.behavior_pattern_signatures


async def test_good_medium_event_can_write_pattern_signature(state):
    event = _learning_event(
        id="evt-learn-ok",
        confidence_band=ConfidenceBand.MEDIUM,
    )
    state.store.behavior_events[event.id] = event
    await on_behavior_completed(state, event)
    assert event.id in state.store.behavior_pattern_signatures


def test_pattern_state_never_establishes_from_one_event():
    assert derive_pattern_state(1, 0) is None
    assert derive_pattern_state(2, 0) == PatternState.CANDIDATE
    assert derive_pattern_state(3, 0) == PatternState.PRELIMINARY
    assert derive_pattern_state(8, 0) == PatternState.PRELIMINARY
    assert derive_pattern_state(4, 1) == PatternState.ESTABLISHED


def test_semantically_similar_patterns_survive_small_signal_differences():
    left = {
        "meaning_key": "guarda proprietario porta proprietario prima passeggiata",
        "context_key": "pre walk",
        "salient_actions": ["looks at owner", "looks at door"],
    }
    right = {
        "meaning_key": "guarda porta e proprietario prima della passeggiata",
        "context_key": "pre walk",
        "salient_actions": ["looks at door"],
    }
    unrelated = {
        "meaning_key": "porta scarpa quando arriva ospite",
        "context_key": "visitor arrival",
        "salient_actions": ["carries shoe"],
    }
    assert semantic_pattern_similarity(left, right) >= 0.65
    assert semantic_pattern_similarity(left, unrelated) < 0.65


async def test_burst_clips_do_not_count_as_independent_pattern_support(
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
    assert patterns == []

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
        support_count=4,
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
    assert state.store.patterns[pattern_id].reliability_band == "high"


async def test_owner_contestation_does_not_manufacture_observations(client, auth_headers, state):
    dog_id = await create_dog(client, auth_headers)
    pattern_id = new_id()
    state.store.patterns[pattern_id] = PersonalPatternRec(
        id=pattern_id,
        dog_id=dog_id,
        title="Cerca spesso il gioco",
        state=PatternState.PRELIMINARY,
        support_count=3,
        confirm_count=0,
        contradict_count=2,
        reliability_band="medium",
        first_seen=datetime(2026, 8, 1, tzinfo=UTC),
        last_seen=datetime(2026, 8, 4, tzinfo=UTC),
    )

    response = await client.post(
        f"/v1/patterns/{pattern_id}/review",
        json={"action": "contest"},
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    assert state.store.patterns[pattern_id].state == PatternState.CONTESTED
    assert state.store.patterns[pattern_id].contradict_count == 2
    assert state.store.patterns[pattern_id].support_count == 3
    assert state.store.patterns[pattern_id].last_seen == datetime(2026, 8, 4, tzinfo=UTC)
    assert state.store.patterns[pattern_id].reliability_band == "low"

    # Retrying the same owner review must not manufacture a second
    # contradiction or inflate the pattern's evidence count.
    repeated = await client.post(
        f"/v1/patterns/{pattern_id}/review",
        json={"action": "contest"},
        headers=auth_headers,
    )
    assert repeated.status_code == 200, repeated.text
    assert state.store.patterns[pattern_id].contradict_count == 2


async def test_pattern_list_normalizes_public_band_and_preserves_nullable_dates(
    client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    pattern_id = new_id()
    state.store.patterns[pattern_id] = PersonalPatternRec(
        id=pattern_id,
        dog_id=dog_id,
        title="Cerca spesso il gioco",
        state=PatternState.PRELIMINARY,
        support_count=3,
        reliability_band="medium",
        first_seen=None,
        last_seen=None,
    )

    response = await client.get(
        f"/v1/dogs/{dog_id}/patterns",
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["reliability_band"] == "MEDIUM"
    assert item["first_seen"] is None
    assert item["last_seen"] is None
