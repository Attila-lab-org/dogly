"""Quota & entitlement service (Spec V1 sez. 7.3 / 21 / 22).

ATOMIC QUOTA: reserve usage server-side before issuing a processing job.
Production uses public.reserve_usage / commit_usage / refund_usage with
reference_id (migration 0006). Local/tests use InMemoryStore + asyncio lock.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains.db import commit_usage_sql, refund_usage_sql, reserve_usage_sql
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

    def __init__(self, store: InMemoryStore, engine: AsyncEngine | None = None) -> None:
        self._store = store
        self._engine = engine

    def get_ledger(self, user_id: str) -> UsageLedgerRec:
        return self._store.ensure_ledger(user_id)

    async def reserve(
        self,
        user_id: str,
        domain: AnalysisDomain,
        *,
        reference_id: str | None = None,
    ) -> UsageLedgerRec:
        if self._engine is not None:
            if not reference_id:
                raise ApiError(ErrorCode.VALIDATION_FAILED, "reference_id is required for SQL quota.")
            payload = await reserve_usage_sql(
                self._engine,
                user_id=user_id,
                domain=domain.value,
                reference_id=reference_id,
            )
            if not payload.get("granted", False) and payload.get("reason") not in (
                "ALREADY_RESERVED",
                "RESERVED",
            ):
                raise QuotaExceeded(domain)
            return self._store.ensure_ledger(user_id)

        async with self._store.lock:
            ledger = self._store.ensure_ledger(user_id)
            limit_f, used_f, reserved_f = _fields(domain)
            if getattr(ledger, used_f) + getattr(ledger, reserved_f) >= getattr(ledger, limit_f):
                raise QuotaExceeded(domain)
            setattr(ledger, reserved_f, getattr(ledger, reserved_f) + 1)
            return ledger

    async def commit(
        self,
        user_id: str,
        domain: AnalysisDomain,
        *,
        reference_id: str | None = None,
    ) -> None:
        if self._engine is not None:
            if not reference_id:
                raise ApiError(ErrorCode.VALIDATION_FAILED, "reference_id is required for SQL quota.")
            await commit_usage_sql(self._engine, reference_id=reference_id)
            return
        async with self._store.lock:
            ledger = self._store.ensure_ledger(user_id)
            _, used_f, reserved_f = _fields(domain)
            if getattr(ledger, reserved_f) > 0:
                setattr(ledger, reserved_f, getattr(ledger, reserved_f) - 1)
                setattr(ledger, used_f, getattr(ledger, used_f) + 1)

    async def refund(
        self,
        user_id: str,
        domain: AnalysisDomain,
        *,
        reference_id: str | None = None,
        reason: str | None = None,
    ) -> None:
        if self._engine is not None:
            if not reference_id:
                raise ApiError(ErrorCode.VALIDATION_FAILED, "reference_id is required for SQL quota.")
            await refund_usage_sql(self._engine, reference_id=reference_id, reason=reason)
            return
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
