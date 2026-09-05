"""Raw media retention helpers (Spec V1 §23.2 / Dogly UX V1).

TTL for temporary AI raw media starts at *terminal* analysis completion,
never at upload init. Gallery album photos are out of scope here.
"""

from __future__ import annotations

from datetime import timedelta

from app.config import Settings
from app.contracts.taxonomy import RetentionState
from app.domains.models import BehaviorCaptureRec, FecalEventRec
from app.domains.repository import InMemoryStore, now_utc
from app.providers.base import StorageProvider

BEHAVIOR_BUCKET = "behavior-raw"
DIGESTIVE_BUCKET = "digestive-raw"


def schedule_behavior_raw_expiry(capture: BehaviorCaptureRec, settings: Settings) -> None:
    """Start the 24h clock when analysis reaches a terminal state."""
    if capture.retention_state != RetentionState.TEMPORARY:
        return
    capture.expires_at = now_utc() + timedelta(hours=settings.raw_media_ttl_hours)


def schedule_digestive_raw_expiry(event: FecalEventRec, settings: Settings) -> None:
    if event.retention_state != RetentionState.TEMPORARY:
        return
    event.expires_at = now_utc() + timedelta(hours=settings.raw_media_ttl_hours)


async def cleanup_expired_raw_media(
    store: InMemoryStore,
    *,
    storage: StorageProvider,
) -> dict:
    """Delete temporary raw objects past expires_at; keep diary/results."""
    now = now_utc()
    deleted_behavior = 0
    deleted_digestive = 0

    for capture in store.captures.values():
        if (
            capture.retention_state == RetentionState.TEMPORARY
            and capture.expires_at is not None
            and capture.expires_at <= now
        ):
            await storage.delete_object(bucket=BEHAVIOR_BUCKET, path=capture.storage_path)
            capture.retention_state = RetentionState.DELETED
            deleted_behavior += 1

    for event in store.fecal_events.values():
        if (
            event.retention_state == RetentionState.TEMPORARY
            and event.expires_at is not None
            and event.expires_at <= now
        ):
            await storage.delete_object(bucket=DIGESTIVE_BUCKET, path=event.image_path)
            event.retention_state = RetentionState.DELETED
            deleted_digestive += 1

    return {
        "deleted_behavior": deleted_behavior,
        "deleted_digestive": deleted_digestive,
        "status": "ok",
    }
