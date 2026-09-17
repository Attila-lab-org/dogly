"""Server-side push dispatch remains consent-gated and deep-linkable."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.contracts.api import UserConsentsPatch
from app.contracts.taxonomy import CareEventType
from app.domains.consents import patch_consents
from app.domains.models import CareEventRec, DeviceInstallationRec
from app.worker import handlers


async def test_care_reminder_dispatch_is_consent_gated(state, monkeypatch):
    user_id = "user-1"
    event = CareEventRec(
        id="care-1",
        dog_id="dog-1",
        user_id=user_id,
        event_type=CareEventType.VET_VISIT,
        title="Visita veterinaria",
        scheduled_at=datetime.now(UTC) + timedelta(minutes=30),
        timezone="Europe/Rome",
        reminder_minutes_before=60,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    state.store.care_events[event.id] = event
    state.store.devices["device-1"] = DeviceInstallationRec(
        id="device-1",
        user_id=user_id,
        platform="ANDROID",
        push_token="ExpoPushToken[test]",
        last_seen=datetime.now(UTC),
    )
    sent_payloads: list[dict] = []

    async def fake_send(tokens, **payload):
        sent_payloads.append({"tokens": tokens, **payload})
        return len(tokens)

    monkeypatch.setattr(handlers, "send_push", fake_send)

    disabled = await handlers.process_care_reminder_dispatch(state)
    assert disabled["devices_sent"] == 0
    assert event.reminder_sent_at is None

    patch_consents(
        state.store,
        user_id,
        UserConsentsPatch(policy_version="notifications.v1", notifications=True),
    )
    enabled = await handlers.process_care_reminder_dispatch(state)
    assert enabled["devices_sent"] == 1
    assert event.reminder_sent_at is not None
    assert sent_payloads[-1]["data"]["href"] == "/care/care-1"


async def test_quality_rejected_push_has_retry_link(state, monkeypatch):
    user_id = "user-quality"
    patch_consents(
        state.store,
        user_id,
        UserConsentsPatch(policy_version="notifications.v1", notifications=True),
    )
    state.store.devices["device-quality"] = DeviceInstallationRec(
        id="device-quality",
        user_id=user_id,
        platform="ANDROID",
        push_token="ExpoPushToken[quality]",
        last_seen=datetime.now(UTC),
    )
    sent_payloads: list[dict] = []

    async def fake_send(tokens, **payload):
        sent_payloads.append({"tokens": tokens, **payload})
        return len(tokens)

    monkeypatch.setattr(handlers, "send_push", fake_send)

    await handlers.notify_analysis_quality_rejected(
        state,
        user_id=user_id,
        event_id="event-quality",
        domain="DIGESTIVE",
    )

    assert sent_payloads[0]["tokens"] == ["ExpoPushToken[quality]"]
    assert (
        sent_payloads[0]["data"]["href"]
        == "/digestive/processing/event-quality"
    )
    assert "non è stata conteggiata" in sent_payloads[0]["body"]
