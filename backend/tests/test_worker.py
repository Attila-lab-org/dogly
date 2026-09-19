"""Worker end-to-end tests (spec 7.2 / 8.2 / 22): queued -> observing ->
interpreting -> completed with mock providers; idempotent redelivery; quota
commit/refund semantics; internal auth on workflow routes."""

import httpx
import pytest

from app.contracts.taxonomy import BehaviorEventStatus, ContextBucket
from app.providers.base import ProviderRateLimitError
from app.worker.handlers import (
    MAX_TASK_ATTEMPTS,
    RetryableTaskError,
    process_behavior_event,
)
from app.worker.main import create_worker_app
from tests.conftest import create_dog


class TimeoutObserver:
    async def observe(self, *, video_ref, content_type, policy_version, duration_ms):
        del video_ref, content_type, policy_version, duration_ms
        raise TimeoutError


class RateLimitedObserver:
    async def observe(self, *, video_ref, content_type, policy_version, duration_ms):
        del video_ref, content_type, policy_version, duration_ms
        raise ProviderRateLimitError("provider quota exhausted")


async def _queue_behavior_event(
    client,
    headers,
    crid: str,
    *,
    content_type: str = "video/mp4",
) -> str:
    dog_id = await create_dog(client, headers)
    r = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": dog_id,
            "client_request_id": crid,
            "duration_ms": 8000,
            "has_audio": True,
            "bytes": 1_000_000,
            "content_type": content_type,
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
    event_id = await _queue_behavior_event(
        client,
        auth_headers,
        "crid-e2e-0001",
        content_type="video/quicktime",
    )
    capture = state.store.captures[state.store.behavior_events[event_id].capture_id]
    assert capture.content_type == "video/quicktime"
    assert capture.storage_path.endswith(".mov")

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
    assert body["consumer_headline"]
    assert body["baseline_note"]
    assert body["baseline_comparison"] in (
        "RECOGNIZED",
        "VARIATION",
        "LEARNING",
        "CONTESTED",
    )

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


async def test_worker_resumes_event_left_in_observing(
    client, auth_headers, state
):
    event_id = await _queue_behavior_event(
        client,
        auth_headers,
        "crid-resume-observing",
    )
    state.store.behavior_events[event_id].status = BehaviorEventStatus.OBSERVING

    result = await process_behavior_event(state, event_id=event_id)

    assert result["status"] == "COMPLETED"


async def test_worker_resumes_interpreting_from_saved_observation(
    client, auth_headers, state
):
    event_id = await _queue_behavior_event(
        client,
        auth_headers,
        "crid-resume-interpreting",
    )
    event = state.store.behavior_events[event_id]
    capture = state.store.captures[event.capture_id]
    observation, _ = await state.observer.observe(
        video_ref=capture.storage_path,
        content_type=capture.content_type,
        policy_version="test",
        duration_ms=capture.duration_ms,
    )
    event.observation_json = observation.model_dump(mode="json")
    event.status = BehaviorEventStatus.INTERPRETING
    state.observer = TimeoutObserver()

    result = await process_behavior_event(state, event_id=event_id)

    assert result["status"] == "COMPLETED"


async def test_worker_retry_after_reasoner_failure_reuses_saved_observation(
    client, auth_headers, state
):
    event_id = await _queue_behavior_event(
        client,
        auth_headers,
        "crid-resume-reasoner",
    )
    event = state.store.behavior_events[event_id]
    capture = state.store.captures[event.capture_id]
    observation, _ = await state.observer.observe(
        video_ref=capture.storage_path,
        content_type=capture.content_type,
        policy_version="test",
        duration_ms=capture.duration_ms,
    )
    event.observation_json = observation.model_dump(mode="json")
    event.status = BehaviorEventStatus.FAILED_RETRYABLE
    state.observer = TimeoutObserver()

    result = await process_behavior_event(state, event_id=event_id)

    assert result["status"] == "COMPLETED"


async def test_worker_rejects_missing_or_wrong_internal_token(worker_client: httpx.AsyncClient):
    r = await worker_client.post("/tasks/run", json={"task_type": "behavior_analysis", "event_id": "x"})
    assert r.status_code in (401, 403)
    r2 = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": "x"},
        headers={"x-internal-token": "wrong"},
    )
    assert r2.status_code in (401, 403)


async def test_worker_fails_closed_when_production_secret_is_missing(state):
    state.settings.app_env = "production"
    state.settings.worker_internal_token = ""
    app = create_worker_app(state)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/tasks/run",
            json={"task_type": "behavior_analysis", "event_id": "x"},
        )
    assert response.status_code == 401


async def test_retention_cron_requires_distinct_cron_secret(
    worker_client: httpx.AsyncClient,
    state,
):
    denied = await worker_client.get("/tasks/cron/retention")
    assert denied.status_code == 401

    via_worker_token = await worker_client.get(
        "/tasks/cron/retention",
        headers={"Authorization": "Bearer test-internal-token"},
    )
    assert via_worker_token.status_code == 401

    state.settings.cron_secret = "vercel-cron-secret"
    via_cron_secret = await worker_client.get(
        "/tasks/cron/retention",
        headers={"Authorization": "Bearer vercel-cron-secret"},
    )
    assert via_cron_secret.status_code == 200, via_cron_secret.text
    assert via_cron_secret.json()["status"] == "ok"


async def test_worker_unknown_event_acknowledged(worker_client: httpx.AsyncClient):
    r = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": "evt-unknown"},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "ignored_unknown_event"


async def test_behavior_timeout_raises_retryable_and_persists(client, auth_headers, state):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-retry-0001")
    state.observer = TimeoutObserver()

    with pytest.raises(RetryableTaskError) as exc_info:
        await process_behavior_event(state, event_id=event_id)

    assert exc_info.value.payload["event_id"] == event_id
    assert exc_info.value.payload["status"] == "FAILED_RETRYABLE"
    assert exc_info.value.payload["error"] == "PROVIDER_TIMEOUT"
    event = state.store.behavior_events[event_id]
    assert event.status.value == "FAILED_RETRYABLE"
    assert event.attempt_count == 1
    assert event.last_error_code == "PROVIDER_TIMEOUT"


async def test_behavior_provider_rate_limit_stops_after_one_attempt_and_refunds(
    client, auth_headers, state, user_id
):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-rate-limit-0001")
    state.observer = RateLimitedObserver()

    result = await process_behavior_event(state, event_id=event_id)

    assert result["status"] == "FAILED_TERMINAL"
    assert result["error"] == "RATE_LIMITED"
    event = state.store.behavior_events[event_id]
    assert event.attempt_count == 1
    assert event.quota_refunded is True
    ledger = state.store.ensure_ledger(user_id)
    assert ledger.behavior_reserved == 0 and ledger.behavior_used == 0


async def test_behavior_retry_exhaustion_is_terminal_without_raise(
    client, auth_headers, state, user_id
):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-retry-0002")
    state.observer = TimeoutObserver()

    for attempt in range(1, MAX_TASK_ATTEMPTS):
        with pytest.raises(RetryableTaskError):
            await process_behavior_event(state, event_id=event_id)
        assert state.store.behavior_events[event_id].attempt_count == attempt

    result = await process_behavior_event(state, event_id=event_id)
    assert result["status"] == "FAILED_TERMINAL"
    event = state.store.behavior_events[event_id]
    assert event.attempt_count == MAX_TASK_ATTEMPTS
    assert event.completed_at is not None

    # Terminal failure refunds the reservation once (sez. 7.3 / 22).
    ledger = state.store.ensure_ledger(user_id)
    assert ledger.behavior_reserved == 0 and ledger.behavior_used == 0


async def test_worker_retryable_failure_returns_503(
    client, auth_headers, worker_client: httpx.AsyncClient, state
):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-retry-0003")
    state.observer = TimeoutObserver()

    resp = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )

    assert resp.status_code == 503
    body = resp.json()
    assert body["event_id"] == event_id
    assert body["status"] == "FAILED_RETRYABLE"
    assert body["error"] == "PROVIDER_TIMEOUT"
    assert state.store.behavior_events[event_id].attempt_count == 1


async def test_unknown_context_and_checkin_reach_the_composer(
    client: httpx.AsyncClient,
    worker_client: httpx.AsyncClient,
    auth_headers,
    state,
):
    from datetime import UTC, datetime

    dog_id = await create_dog(client, auth_headers)
    patched = await client.patch(
        f"/v1/dogs/{dog_id}/lifestyle",
        json={
            "routine": {
                "today_vs_usual": {
                    "concern": "off",
                    "note": "oggi non è come al solito",
                    "day": datetime.now(UTC).date().isoformat(),
                }
            },
            "confirm": True,
        },
        headers=auth_headers,
    )
    assert patched.status_code == 200, patched.text

    init = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": dog_id,
            "client_request_id": "crid-unknown-ctx",
            "duration_ms": 8000,
            "has_audio": True,
            "bytes": 1_000_000,
            "content_type": "video/mp4",
            "context_bucket": "UNKNOWN",
        },
        headers=auth_headers,
    )
    assert init.status_code == 200, init.text
    capture_id = init.json()["capture_id"]
    complete = await client.post(
        f"/v1/behavior/captures/{capture_id}/complete", headers=auth_headers
    )
    assert complete.status_code == 200, complete.text
    event_id = complete.json()["event_id"]

    processed = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert processed.status_code == 200, processed.text
    assert processed.json()["status"] == "COMPLETED"

    body = (
        await client.get(f"/v1/behavior/events/{event_id}", headers=auth_headers)
    ).json()
    assert body["baseline_comparison"] == "VARIATION"
    assert "diverso dal solito" in body["baseline_note"]
    # Fixture video shows a toy: UNKNOWN must not stay UNKNOWN.
    assert body["context_bucket"] == "PLAY"
    assert state.store.captures[capture_id].context_bucket == ContextBucket.PLAY
    assert "SAFE_" not in (body.get("consumer_headline") or "")


async def test_owner_context_refines_without_observing_video_again(
    client: httpx.AsyncClient,
    worker_client: httpx.AsyncClient,
    auth_headers,
    state,
):
    event_id = await _queue_behavior_event(
        client, auth_headers, "crid-context-refine"
    )
    processed = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert processed.status_code == 200
    observer_calls_before = len(
        [
            record
            for record in state.cost_meter.records
            if record["operation"] == "observer.observe"
        ]
    )

    refined = await client.post(
        f"/v1/behavior/events/{event_id}/context",
        json={"context_bucket": "DOOR_EXIT"},
        headers=auth_headers,
    )

    assert refined.status_code == 200, refined.text
    assert refined.json()["context_bucket"] == "DOOR_EXIT"
    assert any(
        record["operation"] == "reasoner.refine_context"
        for record in state.cost_meter.records
    )
    assert (
        len(
            [
                record
                for record in state.cost_meter.records
                if record["operation"] == "observer.observe"
            ]
        )
        == observer_calls_before
    )


async def test_owner_selects_the_exact_answer_shown_in_the_question(
    client: httpx.AsyncClient,
    worker_client: httpx.AsyncClient,
    auth_headers,
    state,
):
    event_id = await _queue_behavior_event(
        client, auth_headers, "crid-semantic-context"
    )
    processed = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert processed.status_code == 200

    event = state.store.behavior_events[event_id]
    event.interpretation_json["needs_context"] = True
    event.interpretation_json["context_question"] = (
        "Stavi cercando di togliere la calza?"
    )
    event.interpretation_json["context_options"] = [
        {
            "id": "removing_sock",
            "label": "Sì, la stavo togliendo",
        },
        {
            "id": "already_playing",
            "label": "No, stavamo giocando",
        },
    ]

    refined = await client.post(
        f"/v1/behavior/events/{event_id}/context",
        json={"answer_id": "removing_sock"},
        headers=auth_headers,
    )

    assert refined.status_code == 200, refined.text
    body = refined.json()
    assert body["needs_context"] is False
    assert body["context_options"] == []
    assert "Sì, la stavo togliendo" in body["context_effect"]
    stored = state.store.behavior_events[event_id].interpretation_json
    assert stored["context_response"]["label"] == "Sì, la stavo togliendo"

    repeated = await client.post(
        f"/v1/behavior/events/{event_id}/context",
        json={"answer_id": "removing_sock"},
        headers=auth_headers,
    )
    assert repeated.status_code == 200
    assert (
        len(
            [
                record
                for record in state.cost_meter.records
                if record["operation"] == "reasoner.refine_context"
            ]
        )
        == 1
    )


async def test_feedback_correction_research_eligibility_follows_server_consent(
    client: httpx.AsyncClient,
    worker_client: httpx.AsyncClient,
    auth_headers,
    state,
):
    event_id = await _queue_behavior_event(
        client, auth_headers, "crid-feedback-consent"
    )
    await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )

    without_consent = await client.post(
        f"/v1/behavior/events/{event_id}/feedback",
        json={"value": "NO", "correction_label": "OUTSIDE_REQUEST"},
        headers=auth_headers,
    )
    assert without_consent.status_code == 200
    assert state.store.behavior_feedback[event_id].research_eligible is False

    consent = await client.patch(
        "/v1/me/consents",
        json={"policy_version": "privacy-beta/v1", "research_training": True},
        headers=auth_headers,
    )
    assert consent.status_code == 200
    with_consent = await client.post(
        f"/v1/behavior/events/{event_id}/feedback",
        json={"value": "NO", "correction_label": "OUTSIDE_REQUEST"},
        headers=auth_headers,
    )
    assert with_consent.status_code == 200
    assert state.store.behavior_feedback[event_id].research_eligible is True
