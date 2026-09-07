"""Daily USD budget gate (sez. 25): pre-call check vs internal.ai_cost_events,
wired into the real providers before any HTTP call, and mapped by the worker
to a NON-retryable terminal failure (never RetryableTaskError)."""

import httpx
import pytest

from app.config import Settings
from app.providers import (
    gemini_observer,
    openai_digestive_vision,
    openai_reasoner,
)
from app.providers.budget import BudgetExceededError, check_daily_budget
from app.providers.gemini_observer import GeminiVideoObserver
from app.providers.openai_digestive_vision import OpenAIDigestiveVision
from app.providers.openai_reasoner import OpenAIReasoner
from app.worker.handlers import process_behavior_event


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value


class _FakeConn:
    def __init__(self, engine):
        self._engine = engine

    async def execute(self, stmt, params=None):
        del params
        sql = str(stmt)
        self._engine.statements.append(sql)
        if "pg_advisory_xact_lock" in sql:
            return _FakeResult(None)
        return _FakeResult(self._engine.spent_usd)


class _FakeEngine:
    """Async-engine stand-in: records SQL, returns a fixed daily SUM."""

    def __init__(self, spent_usd: float = 0.0):
        self.spent_usd = spent_usd
        self.statements: list[str] = []

    def begin(self):
        conn = _FakeConn(self)

        class _CM:
            async def __aenter__(self):
                return conn

            async def __aexit__(self, *exc):
                return False

        return _CM()


async def test_gate_passes_under_budget_and_issues_lock_and_sum():
    engine = _FakeEngine(spent_usd=1.23)
    await check_daily_budget(
        engine, role="observer", budget_usd=50.0, operation="observer.observe"
    )
    joined = "\n".join(engine.statements)
    assert "pg_advisory_xact_lock" in joined
    assert "internal.ai_cost_events" in joined
    assert "sum(cost_usd)" in joined
    assert "current_date" in joined


async def test_gate_refuses_at_budget_and_names_it():
    engine = _FakeEngine(spent_usd=50.0)
    with pytest.raises(BudgetExceededError) as exc_info:
        await check_daily_budget(
            engine, role="observer", budget_usd=50.0, operation="observer.observe"
        )
    message = str(exc_info.value)
    assert "observer" in message
    assert "50.00" in message
    assert exc_info.value.budget_usd == 50.0
    assert exc_info.value.spent_usd == 50.0


async def test_gate_noop_without_engine_or_with_zero_budget():
    await check_daily_budget(
        None, role="observer", budget_usd=50.0, operation="observer.observe"
    )
    engine = _FakeEngine(spent_usd=999.0)
    await check_daily_budget(
        engine, role="observer", budget_usd=0.0, operation="observer.observe"
    )
    assert engine.statements == []


def _settings(**overrides) -> Settings:
    values = {
        "app_env": "local",
        "observer_budget_usd_per_day": 0.5,
        "reasoner_budget_usd_per_day": 0.5,
        "digestive_vision_budget_usd_per_day": 0.5,
    }
    values.update(overrides)
    return Settings(**values)


async def test_gemini_observer_refuses_before_any_api_call(monkeypatch):
    monkeypatch.setattr(
        gemini_observer, "get_engine", lambda s: _FakeEngine(spent_usd=0.9)
    )
    observer = GeminiVideoObserver(_settings())
    with pytest.raises(BudgetExceededError):
        await observer.observe(
            video_ref="https://example.test/clip.mp4",
            content_type="video/mp4",
            policy_version="policy-v1",
            duration_ms=8000,
        )


async def test_openai_reasoner_refuses_before_any_api_call(monkeypatch):
    monkeypatch.setattr(
        openai_reasoner, "get_engine", lambda s: _FakeEngine(spent_usd=0.9)
    )
    reasoner = OpenAIReasoner(_settings())
    with pytest.raises(BudgetExceededError):
        # The gate fires before any argument is touched: no HTTP is attempted.
        await reasoner.interpret(
            observation=None,
            context_bucket=None,
            policy_version="policy-v1",
            eligible_memory=[],
            knowledge_context=None,
            dog_context=None,
        )


async def test_openai_digestive_refuses_before_any_api_call(monkeypatch):
    monkeypatch.setattr(
        openai_digestive_vision,
        "get_engine",
        lambda s: _FakeEngine(spent_usd=0.9),
    )
    observer = OpenAIDigestiveVision(
        _settings(
            digestive_vision_provider="openai",
            digestive_vision_model="gpt-5-mini",
            openai_api_key="oai-key",
        )
    )
    with pytest.raises(BudgetExceededError):
        await observer.observe_stool(
            image_ref="https://example.test/stool.jpg"
        )


class _BudgetObserver:
    async def observe(self, *, video_ref, content_type, policy_version, duration_ms):
        del video_ref, content_type, policy_version, duration_ms
        raise BudgetExceededError("observer", 50.0, 50.0)


class _BudgetReasoner:
    async def interpret(self, **kwargs):
        del kwargs
        raise BudgetExceededError("reasoner", 50.0, 50.0)


async def _queue_behavior_event(client, headers, crid: str) -> str:
    dog_id = await _create_dog(client, headers)
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
    c = await client.post(
        f"/v1/behavior/captures/{capture_id}/complete", headers=headers
    )
    assert c.status_code == 200, c.text
    return c.json()["event_id"]


async def _create_dog(client, headers) -> str:
    resp = await client.post("/v1/dogs", json={"name": "Rocky"}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_observer_budget_exhaustion_is_terminal_without_raise(
    client: httpx.AsyncClient, auth_headers, state, user_id
):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-budget-0001")
    state.observer = _BudgetObserver()

    result = await process_behavior_event(state, event_id=event_id)

    assert result["status"] == "FAILED_TERMINAL"
    assert result["error"] == "AI_BUDGET_EXCEEDED"
    event = state.store.behavior_events[event_id]
    assert event.last_error_code == "AI_BUDGET_EXCEEDED"
    # Terminal failures refund the reservation once (sez. 7.3), never commit.
    ledger = state.store.ensure_ledger(user_id)
    assert ledger.behavior_used == 0
    assert ledger.behavior_reserved == 0
    # Redelivery of the terminal event is a no-op, never a retryable raise.
    again = await process_behavior_event(state, event_id=event_id)
    assert again["noop"] is True


async def test_reasoner_budget_exhaustion_is_terminal_without_raise(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_behavior_event(client, auth_headers, "crid-budget-0002")
    state.reasoner = _BudgetReasoner()

    result = await process_behavior_event(state, event_id=event_id)

    assert result["status"] == "FAILED_TERMINAL"
    assert result["error"] == "AI_BUDGET_EXCEEDED"
    assert state.store.behavior_events[event_id].last_error_code == (
        "AI_BUDGET_EXCEEDED"
    )
