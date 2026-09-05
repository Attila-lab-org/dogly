"""Raw media retention helpers (Spec V1 §23.2 / Dogly UX V1).

TTL for temporary AI raw media starts at *terminal* analysis completion,
never at upload init. Gallery album photos are out of scope here.

Vercel cron is not declared in vercel.json because this project exposes
retention through the internal token-protected POST /tasks/run workflow route,
while Vercel cron invokes headerless GET requests.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

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


async def cleanup_expired_raw_media_db(
    engine: AsyncEngine,
    *,
    storage: StorageProvider,
    limit: int = 100,
) -> dict:
    """Delete DB-tracked expired raw/export media and mark source rows purged."""
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select bucket, object_path, source_id, source_table
                    from internal.media_due_for_deletion
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
        ).mappings().all()

    counts = {
        "deleted_behavior": 0,
        "deleted_digestive": 0,
        "deleted_food_labels": 0,
        "deleted_exports": 0,
        "status": "ok",
    }
    for row in rows:
        await storage.delete_object(bucket=str(row["bucket"]), path=str(row["object_path"]))
        async with engine.begin() as conn:
            await conn.execute(
                text("select internal.mark_media_deleted(:source_table, :source_id)"),
                {"source_table": row["source_table"], "source_id": row["source_id"]},
            )
        if row["source_table"] == "behavior_captures":
            counts["deleted_behavior"] += 1
        elif row["source_table"] == "fecal_events":
            counts["deleted_digestive"] += 1
        elif row["source_table"] == "food_products":
            counts["deleted_food_labels"] += 1
        elif row["source_table"] == "export_jobs":
            counts["deleted_exports"] += 1
    counts["deleted_total"] = sum(v for v in counts.values() if isinstance(v, int))
    return counts


async def arm_behavior_capture_expiry(engine: AsyncEngine, capture_id: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update public.behavior_captures
                set expires_at = internal.media_expiry_at('BEHAVIOR_RAW')
                where id = :capture_id
                  and retention_state = 'TEMPORARY'
                """
            ),
            {"capture_id": capture_id},
        )


async def arm_fecal_expiry(engine: AsyncEngine, event_id: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update public.fecal_events
                set expires_at = internal.media_expiry_at('DIGESTIVE_RAW')
                where id = :event_id
                  and retention_state = 'TEMPORARY'
                """
            ),
            {"event_id": event_id},
        )
