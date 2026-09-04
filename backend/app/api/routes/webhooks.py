"""RevenueCat webhook route (sez. 9): signature required, NO user JWT.

Idempotent on RevenueCat event id (sez. 21.1/22). Updates the server-side
entitlement mirror; mobile entitlement is never authoritative.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Request

from app.api.deps import StateDep
from app.contracts.api import RevenueCatWebhookResponse
from app.contracts.errors import ApiError, ErrorCode
from app.domains.repository import now_utc
from app.providers.billing import (
    WebhookSignatureError,
    map_revenuecat_event,
    verify_revenuecat_signature,
)

router = APIRouter()


@router.post("/webhooks/revenuecat", response_model=RevenueCatWebhookResponse)
async def revenuecat_webhook(
    request: Request,
    state: StateDep,
    authorization: Annotated[str | None, Header()] = None,
) -> RevenueCatWebhookResponse:
    try:
        verify_revenuecat_signature(
            authorization_header=authorization,
            secret=state.settings.revenuecat_webhook_secret,
        )
    except WebhookSignatureError as exc:
        raise ApiError(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Webhook signature verification failed.") from exc

    payload = await request.json()
    update = map_revenuecat_event(payload)
    if update is None:
        return RevenueCatWebhookResponse(processed=False)

    store = state.store
    event_id = update.get("event_id")
    if event_id:
        if event_id in store.webhook_events_seen:
            return RevenueCatWebhookResponse(processed=True, duplicate=True)
        store.webhook_events_seen.add(event_id)

    sub = store.ensure_subscription(update["user_id"])
    store.subscriptions[update["user_id"]] = sub.model_copy(
        update={
            "plan": update["plan"],
            "status": update["status"],
            "store": update.get("store"),
            "product_id": update.get("product_id"),
            "updated_at": now_utc(),
        }
    )
    return RevenueCatWebhookResponse(processed=True)
