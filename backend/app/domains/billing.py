"""Quota & entitlement service (Spec V1 sez. 7.3 / 21 / 22).

ATOMIC QUOTA: reserve usage server-side before issuing a processing job.
Quality rejection before meaningful AI work and terminal technical failures
refund the reservation. Clear/ambiguous/insufficient completed results consume
one unit. Parallel requests cannot exceed allowance.

Production: the reserve/commit/refund operations are executed by the DB
functions internal.reserve_usage / commit_usage / refund_usage (migration
0006, workstream B) under row lock. Locally the in-memory store serializes the
critical section with a lock, preserving the same semantics for tests.
"""

from __future__ import annotations

from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains.repository import (
    PLAN_ALLOWANCES,
    InMemoryStore,
    UsageLedgerRec,
    now_utc,
)


class QuotaExceeded(ApiError):
    def __init__(self, domain: AnalysisDomain) -> None:
        super().__init__(
            ErrorCode.QUOTA_EXHAUSTED,
            f"Monthly {domain.value.lower()} analysis quota exhausted. Upgrade or wait for the monthly reset.",
        )


def plan_limits(plan: str) -> dict[str, int]:
    return PLAN_ALLOWANCES.get(plan, PLAN_ALLOWANCES["FREE"])


def max_active_dogs(plan: str) -> int:
    return plan_limits(plan)["max_active_dogs"]


def _fields(domain: AnalysisDomain) -> tuple[str, str, str]:
    if domain == AnalysisDomain.BEHAVIOR:
        return "behavior_limit", "behavior_used", "behavior_reserved"
    if domain == AnalysisDomain.DIGESTIVE:
        return "digestive_limit", "digestive_used", "digestive_reserved"
    raise ApiError(ErrorCode.VALIDATION_FAILED, f"Domain {domain} does not consume quota")


class QuotaService:
    """Atomic reserve/commit/refund over the usage ledger."""

    def __init__(self, store: InMemoryStore) -> None:
        self._store = store

    def get_ledger(self, user_id: str) -> UsageLedgerRec:
        return self._store.ensure_ledger(user_id)

    async def reserve(self, user_id: str, domain: AnalysisDomain) -> UsageLedgerRec:
        """Atomic reservation. Raises QuotaExceeded when no allowance remains.
        Production equivalent: SELECT internal.reserve_usage(user, domain)."""
        async with self._store.lock:
            ledger = self._store.ensure_ledger(user_id)
            limit_f, used_f, reserved_f = _fields(domain)
            if getattr(ledger, used_f) + getattr(ledger, reserved_f) >= getattr(ledger, limit_f):
                raise QuotaExceeded(domain)
            setattr(ledger, reserved_f, getattr(ledger, reserved_f) + 1)
            return ledger

    async def commit(self, user_id: str, domain: AnalysisDomain) -> None:
        """Convert one reservation into consumption (event completed).
        Production equivalent: SELECT internal.commit_usage(...)."""
        async with self._store.lock:
            ledger = self._store.ensure_ledger(user_id)
            _, used_f, reserved_f = _fields(domain)
            if getattr(ledger, reserved_f) > 0:
                setattr(ledger, reserved_f, getattr(ledger, reserved_f) - 1)
                setattr(ledger, used_f, getattr(ledger, used_f) + 1)

    async def refund(self, user_id: str, domain: AnalysisDomain) -> None:
        """Release one reservation without consumption (quality rejection /
        terminal technical failure). Idempotent by event state (callers check
        quota_refunded flag). Production: SELECT internal.refund_usage(...)."""
        async with self._store.lock:
            ledger = self._store.ensure_ledger(user_id)
            _, _, reserved_f = _fields(domain)
            if getattr(ledger, reserved_f) > 0:
                setattr(ledger, reserved_f, getattr(ledger, reserved_f) - 1)


def subscription_status_payload(store: InMemoryStore, user_id: str) -> dict:
    sub = store.ensure_subscription(user_id)
    ledger = store.ensure_ledger(user_id)
    limits = plan_limits(sub.plan)
    return {
        "plan": {
            "plan": sub.plan,
            "status": sub.status,
            "renews_at": sub.renews_at,
            "max_active_dogs": limits["max_active_dogs"],
        },
        "entitlement_source": "revenuecat_mirror",
        "limits": {
            "behavior": {
                "limit": ledger.behavior_limit,
                "used": ledger.behavior_used,
                "reserved": ledger.behavior_reserved,
            },
            "digestive": {
                "limit": ledger.digestive_limit,
                "used": ledger.digestive_used,
                "reserved": ledger.digestive_reserved,
            },
            "reset_at": ledger.reset_at,
        },
        "synced_at": now_utc(),
    }
