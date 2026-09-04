"""RevenueCat webhook verification + entitlement mapping (sez. 21.1).

Webhook authenticity is checked against the configured shared secret in the
Authorization header; event handling is idempotent on event id. Mobile
entitlement is never authoritative.
"""

from __future__ import annotations

import hmac
from typing import Any


class WebhookSignatureError(Exception):
    pass


def verify_revenuecat_signature(*, authorization_header: str | None, secret: str) -> None:
    """RevenueCat authenticates webhooks via a shared secret in the
    Authorization header. Constant-time comparison; empty secret => closed."""
    if not secret or not authorization_header:
        raise WebhookSignatureError("missing webhook authorization")
    if not hmac.compare_digest(authorization_header.strip(), secret):
        raise WebhookSignatureError("invalid webhook signature")


def map_revenuecat_event(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Map a RevenueCat webhook payload to an entitlement mirror update.

    Returns None for event types we intentionally ignore. Never trusts
    client-supplied entitlement state.
    """
    event = payload.get("event") or {}
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    if not event_type or not app_user_id:
        return None

    premium_types = {"INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "NON_RENEWING_PURCHASE"}
    inactive_types = {"EXPIRATION", "REFUND", "SUBSCRIPTION_PAUSED"}
    if event_type in premium_types:
        status = "active"
    elif event_type in inactive_types:
        status = "inactive"
    elif event_type in {"CANCELLATION", "BILLING_ISSUE"}:
        status = "grace_or_cancelled"
    else:
        return None

    product_id = event.get("product_id", "")
    plan = "FREE"
    if status == "active":
        plan = "PREMIUM_ANNUAL" if "annual" in product_id.lower() else "PREMIUM_MONTHLY"

    return {
        "event_id": event.get("id"),
        "user_id": app_user_id,
        "plan": plan,
        "status": status,
        "store": event.get("store"),
        "product_id": product_id,
        "expiration_at_ms": event.get("expiration_at_ms"),
    }
