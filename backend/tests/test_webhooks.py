"""RevenueCat webhook HTTP boundary: auth, mapping, and idempotency."""

from __future__ import annotations


def _payload(event_id: str, user_id: str) -> dict:
    return {
        "event": {
            "id": event_id,
            "type": "INITIAL_PURCHASE",
            "app_user_id": user_id,
            "product_id": "dogly_premium_annual",
            "store": "PLAY_STORE",
        }
    }


async def test_revenuecat_webhook_rejects_invalid_signature(client, state, user_id):
    state.settings.revenuecat_webhook_secret = "revenuecat-test-secret"
    response = await client.post(
        "/v1/webhooks/revenuecat",
        headers={"Authorization": "wrong"},
        json=_payload("rc-invalid", user_id),
    )
    assert response.status_code in {401, 403}
    assert state.store.subscriptions == {}


async def test_revenuecat_webhook_is_idempotent_and_updates_entitlement(
    client, state, user_id
):
    secret = "revenuecat-test-secret"
    state.settings.revenuecat_webhook_secret = secret
    payload = _payload("rc-event-1", user_id)

    first = await client.post(
        "/v1/webhooks/revenuecat",
        headers={"Authorization": secret},
        json=payload,
    )
    second = await client.post(
        "/v1/webhooks/revenuecat",
        headers={"Authorization": secret},
        json=payload,
    )

    assert first.status_code == 200
    assert first.json() == {"processed": True, "duplicate": False}
    assert second.json() == {"processed": True, "duplicate": True}
    subscription = state.store.subscriptions[user_id]
    assert subscription.plan == "PREMIUM_ANNUAL"
    assert subscription.status == "active"
