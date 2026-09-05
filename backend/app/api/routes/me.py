"""GET /v1/me — profile, plan, usage, feature availability (sez. 9)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import MeResponse, UserConsentsPatch, UserConsentsResponse
from app.domains import billing_db, consents_db, profiles_db
from app.domains import consents as consents_domain
from app.domains.billing import plan_limits

router = APIRouter()


@router.get("/me/consents", response_model=UserConsentsResponse)
async def get_consents(state: StateDep, user_id: UserIdDep) -> UserConsentsResponse:
    if state.engine is not None:
        return await consents_db.get_consents(state.engine, user_id)
    return consents_domain.get_consents(state.store, user_id)


@router.patch("/me/consents", response_model=UserConsentsResponse)
async def patch_consents(
    payload: UserConsentsPatch, state: StateDep, user_id: UserIdDep
) -> UserConsentsResponse:
    if state.engine is not None:
        return await consents_db.patch_consents(state.engine, user_id, payload)
    return consents_domain.patch_consents(state.store, user_id, payload)


@router.get("/me", response_model=MeResponse)
async def get_me(state: StateDep, user_id: UserIdDep) -> MeResponse:
    if state.engine is not None:
        profile = await profiles_db.get_or_create_profile(state.engine, user_id)
        sub = await billing_db.get_subscription(state.engine, user_id)
        ledger = await billing_db.get_usage_ledger(state.engine, user_id)
    else:
        store = state.store
        profile = store.ensure_profile(user_id)
        sub = store.ensure_subscription(user_id)
        ledger = store.ensure_ledger(user_id)
    limits = plan_limits(sub.plan)
    premium = sub.plan != "FREE" and sub.status == "active"
    return MeResponse(
        profile={
            "user_id": profile.user_id,
            "locale": profile.locale,
            "timezone": profile.timezone,
            "created_at": profile.created_at,
        },
        plan={
            "plan": sub.plan,
            "status": sub.status,
            "renews_at": sub.renews_at,
            "max_active_dogs": limits["max_active_dogs"],
        },
        usage={
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
        # Feature availability is backend-owned (sez. 4.1: no hardcoded UI rules).
        feature_availability={
            "full_diary": premium,
            "pattern_insights": premium,
            "nutrition_insights": premium,
        },
    )
