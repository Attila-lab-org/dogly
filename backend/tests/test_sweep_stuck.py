"""Sweep: eventi vecchi vanno in FAILED_TERMINAL con rimborso quota."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.contracts.taxonomy import BehaviorEventStatus
from app.domains.models import BehaviorEventRec, FecalEventRec
from app.worker.sweep import sweep_stuck_events


def _old(minutes: int) -> datetime:
    return datetime.now(UTC) - timedelta(minutes=minutes)


async def test_sweep_terminates_old_observing_behavior_and_refunds(state):
    event = BehaviorEventRec(
        id="evt-stuck-beh",
        capture_id="cap-stuck",
        dog_id="dog-stuck",
        user_id="user-stuck",
        status=BehaviorEventStatus.OBSERVING,
        created_at=_old(40),
        attempt_count=1,
    )
    state.store.behavior_events[event.id] = event
    ledger = state.store.ensure_ledger("user-stuck")
    ledger.behavior_reserved = 1

    result = await sweep_stuck_events(
        state, min_age_minutes=15, max_age_minutes=30
    )

    assert result["behavior_terminated"] == 1
    assert event.status is BehaviorEventStatus.FAILED_TERMINAL
    assert event.quota_refunded is True
    assert event.last_error_code == "PROCESSING_TIMEOUT"
    assert state.store.ensure_ledger("user-stuck").behavior_reserved == 0


async def test_sweep_terminates_old_digestive_event(state):
    event = FecalEventRec(
        id="evt-stuck-dig",
        dog_id="dog-stuck",
        user_id="user-stuck",
        client_request_id="crid-stuck",
        image_path="digestive/x.jpg",
        status="OBSERVING",
        created_at=_old(45),
        attempt_count=2,
    )
    state.store.fecal_events[event.id] = event

    result = await sweep_stuck_events(
        state, min_age_minutes=15, max_age_minutes=30
    )

    assert result["digestive_terminated"] == 1
    assert event.status == "FAILED_TERMINAL"
    assert event.last_error_code == "PROCESSING_TIMEOUT"
    assert event.quota_refunded is True


async def test_sweep_skips_fresh_events(state):
    event = BehaviorEventRec(
        id="evt-fresh",
        capture_id="cap-fresh",
        dog_id="dog-fresh",
        user_id="user-fresh",
        status=BehaviorEventStatus.OBSERVING,
        created_at=_old(2),
        attempt_count=1,
    )
    state.store.behavior_events[event.id] = event

    result = await sweep_stuck_events(
        state, min_age_minutes=15, max_age_minutes=30
    )

    assert result["behavior_terminated"] == 0
    assert result["behavior_redispatched"] == 0
    assert event.status is BehaviorEventStatus.OBSERVING


async def test_sweep_terminates_after_max_attempts_even_if_young(state):
    event = BehaviorEventRec(
        id="evt-attempts",
        capture_id="cap-attempts",
        dog_id="dog-attempts",
        user_id="user-attempts",
        status=BehaviorEventStatus.FAILED_RETRYABLE,
        created_at=_old(16),
        attempt_count=5,
    )
    state.store.behavior_events[event.id] = event

    result = await sweep_stuck_events(
        state, min_age_minutes=15, max_age_minutes=30
    )

    assert result["behavior_terminated"] == 1
    assert event.status is BehaviorEventStatus.FAILED_TERMINAL


@pytest.mark.asyncio
async def test_sweep_cron_requires_secret_and_returns_counts(
    worker_client: httpx.AsyncClient, state
):
    state.settings.cron_secret = "vercel-cron-secret"
    denied = await worker_client.get("/tasks/cron/sweep-stuck")
    assert denied.status_code == 401

    ok = await worker_client.get(
        "/tasks/cron/sweep-stuck",
        headers={"Authorization": "Bearer vercel-cron-secret"},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert "behavior_terminated" in body
    assert "digestive_terminated" in body
