"""Quota service tests (spec 7.3 / 21 / 22): atomic reserve/commit/refund,
no parallel overshoot of allowance."""

import asyncio

import pytest

from app.api.deps import AppState
from app.contracts.taxonomy import AnalysisDomain
from app.domains.billing import QuotaExceeded, QuotaService


async def test_reserve_commit_refund_cycle(state: AppState):
    quota = QuotaService(state.store)
    user = "user-quota-1"
    await quota.reserve(user, AnalysisDomain.BEHAVIOR)
    ledger = quota.get_ledger(user)
    assert ledger.behavior_reserved == 1 and ledger.behavior_used == 0

    await quota.commit(user, AnalysisDomain.BEHAVIOR)
    ledger = quota.get_ledger(user)
    assert ledger.behavior_reserved == 0 and ledger.behavior_used == 1

    await quota.reserve(user, AnalysisDomain.BEHAVIOR)
    await quota.refund(user, AnalysisDomain.BEHAVIOR)
    ledger = quota.get_ledger(user)
    assert ledger.behavior_reserved == 0 and ledger.behavior_used == 1


async def test_production_does_not_block_when_purchases_are_closed(
    state: AppState, monkeypatch: pytest.MonkeyPatch
):
    from app.config import Settings, get_settings
    from app.domains import billing

    monkeypatch.setattr(
        billing,
        "_quota_blocks_when_exhausted",
        lambda: False,
    )
    get_settings.cache_clear()
    monkeypatch.setattr(
        "app.config.get_settings",
        lambda: Settings(app_env="production", purchases_enabled=False),
    )
    quota = QuotaService(state.store)
    user = "user-quota-beta"
    for _ in range(6):
        await quota.reserve(user, AnalysisDomain.BEHAVIOR)


async def test_free_plan_exhaustion(state: AppState):
    quota = QuotaService(state.store)
    user = "user-quota-2"  # FREE default: 3 behavior / month
    for _ in range(3):
        await quota.reserve(user, AnalysisDomain.BEHAVIOR)
    with pytest.raises(QuotaExceeded) as excinfo:
        await quota.reserve(user, AnalysisDomain.BEHAVIOR)
    assert excinfo.value.code.value == "QUOTA_EXHAUSTED"


async def test_parallel_reservations_never_exceed_allowance(state: AppState):
    quota = QuotaService(state.store)
    user = "user-quota-3"

    async def try_reserve() -> bool:
        try:
            await quota.reserve(user, AnalysisDomain.DIGESTIVE)
            return True
        except QuotaExceeded:
            return False

    results = await asyncio.gather(*(try_reserve() for _ in range(10)))
    assert sum(results) == 3  # FREE digestive allowance
    assert quota.get_ledger(user).digestive_reserved == 3
