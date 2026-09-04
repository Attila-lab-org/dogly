"""Subscription & usage routes (sez. 9): server entitlement + allowance ledger."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import SubscriptionStatusResponse, UsageResponse
from app.domains.billing import subscription_status_payload

router = APIRouter()


@router.get("/subscription/status", response_model=SubscriptionStatusResponse)
async def subscription_status(state: StateDep, user_id: UserIdDep) -> SubscriptionStatusResponse:
    return SubscriptionStatusResponse(**subscription_status_payload(state.store, user_id))


@router.get("/usage", response_model=UsageResponse)
async def get_usage(state: StateDep, user_id: UserIdDep) -> UsageResponse:
    ledger = state.store.ensure_ledger(user_id)
    return UsageResponse(
        ledger={
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
        }
    )
