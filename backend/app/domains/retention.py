"""Raw media retention helpers (Spec V1 §23.2 / Dogly UX V1).

TTL for temporary AI raw media starts at *terminal* analysis completion,
never at upload init. Gallery album photos are out of scope here.

Vercel Cron invokes GET /tasks/cron/retention daily (vercel.json). Auth is
WORKER_INTERNAL_TOKEN or CRON_SECRET via Authorization: Bearer.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import Settings
from app.contracts.taxonomy import RetentionState
from app.domains.models import BehaviorCaptureRec, FecalEventRec
from app.domains.repository import InMemoryStore, now_utc
from app.providers.base import StorageProvider

BEHAVIOR_BUCKET = "behavior-raw"
DIGESTIVE_BUCKET = "digestive-raw"
QUARANTINE_AFTER_FAILURES = 3

logger = logging.getLogger(__name__)

MarkDeleted = Callable[[Mapping[str, Any]], Awaitable[None]]


def schedule_behavior_raw_expiry(capture: BehaviorCaptureRec, settings: Settings) -> None:
    """Start the 24h clock when analysis reaches a terminal state."""
    if capture.retention_state != RetentionState.TEMPORARY:
        return
    capture.expires_at = now_utc() + timedelta(hours=settings.raw_media_ttl_hours)


def schedule_digestive_raw_expiry(event: FecalEventRec, settings: Settings) -> None:
    if event.retention_state != RetentionState.TEMPORARY:
        return
    event.expires_at = now_utc() + timedelta(hours=settings.raw_media_ttl_hours)


def _empty_cleanup_counts() -> dict[str, Any]:
    return {
        "deleted_behavior": 0,
        "deleted_digestive": 0,
        "deleted_food_labels": 0,
        "deleted_exports": 0,
        "deleted_orphans": 0,
        "deleted_total": 0,
        "processed": 0,
        "failed": 0,
        "skipped": 0,
        "quarantined": 0,
        "status": "ok",
        "http_status": 200,
    }


def _count_deleted(counts: dict[str, Any], source_table: str) -> None:
    if source_table == "behavior_captures":
        counts["deleted_behavior"] += 1
    elif source_table == "fecal_events":
        counts["deleted_digestive"] += 1
    elif source_table == "food_products":
        counts["deleted_food_labels"] += 1
    elif source_table == "export_jobs":
        counts["deleted_exports"] += 1
    elif source_table == "orphan_object":
        counts["deleted_orphans"] += 1
    counts["deleted_total"] += 1
    counts["processed"] += 1


def _finalize_cleanup_counts(counts: dict[str, Any]) -> dict[str, Any]:
    if counts["failed"] > 0 and counts["processed"] == 0:
        counts["status"] = "failed"
        counts["http_status"] = 500
    else:
        counts["status"] = "ok"
        counts["http_status"] = 200
    # FIX 1.7: include the request/run id so a support engineer can grep the
    # cron run by correlation id (propagated from the worker middleware).
    from app.observability.request_context import get_request_id

    run_id = get_request_id() or "-"
    counts["run_id"] = run_id
    logger.info(
        "retention cleanup finished run_id=%s processed=%s failed=%s skipped=%s quarantined=%s",
        run_id,
        counts["processed"],
        counts["failed"],
        counts["skipped"],
        counts["quarantined"],
    )
    return counts


def _memory_failure_tracker(store: InMemoryStore) -> dict[tuple[str, str], dict[str, Any]]:
    tracker = getattr(store, "retention_delete_failures", None)
    if tracker is None:
        tracker = {}
        store.retention_delete_failures = tracker
    return tracker


def _is_memory_quarantined(
    tracker: dict[tuple[str, str], dict[str, Any]], bucket: str, path: str
) -> bool:
    row = tracker.get((bucket, path))
    return bool(row and row.get("quarantined"))


def _record_memory_failure(
    tracker: dict[tuple[str, str], dict[str, Any]],
    *,
    bucket: str,
    path: str,
    reason: str,
) -> bool:
    row = tracker.setdefault((bucket, path), {"consecutive": 0, "quarantined": False})
    row["consecutive"] = int(row.get("consecutive") or 0) + 1
    row["last_error"] = reason
    if row["consecutive"] >= QUARANTINE_AFTER_FAILURES:
        row["quarantined"] = True
        return True
    return False


def _clear_memory_failure(
    tracker: dict[tuple[str, str], dict[str, Any]], bucket: str, path: str
) -> None:
    tracker.pop((bucket, path), None)


async def _is_db_quarantined(engine: AsyncEngine, bucket: str, path: str) -> bool:
    try:
        async with engine.connect() as conn:
            row = (
                await conn.execute(
                    text(
                        """
                        select 1
                        from internal.media_retention_quarantine
                        where bucket = :bucket
                          and object_path = :path
                          and quarantined_at is not null
                        """
                    ),
                    {"bucket": bucket, "path": path},
                )
            ).first()
        return row is not None
    except Exception:
        logger.warning(
            "retention quarantine lookup failed bucket=%s path=%s",
            bucket,
            path,
            exc_info=True,
        )
        return False


async def _record_db_failure(
    engine: AsyncEngine,
    *,
    bucket: str,
    path: str,
    source_id: Any,
    source_table: str,
    reason: str,
) -> bool:
    try:
        async with engine.begin() as conn:
            row = (
                await conn.execute(
                    text(
                        """
                        insert into internal.media_retention_quarantine (
                          bucket, object_path, source_id, source_table,
                          consecutive_failures, last_error, updated_at
                        ) values (
                          :bucket, :path, :source_id, :source_table,
                          1, :reason, now()
                        )
                        on conflict (bucket, object_path) do update set
                          consecutive_failures =
                            internal.media_retention_quarantine.consecutive_failures + 1,
                          last_error = excluded.last_error,
                          source_id = excluded.source_id,
                          source_table = excluded.source_table,
                          updated_at = now(),
                          quarantined_at = case
                            when internal.media_retention_quarantine.consecutive_failures + 1
                                 >= :limit
                            then coalesce(
                              internal.media_retention_quarantine.quarantined_at,
                              now()
                            )
                            else internal.media_retention_quarantine.quarantined_at
                          end
                        returning consecutive_failures, quarantined_at
                        """
                    ),
                    {
                        "bucket": bucket,
                        "path": path,
                        "source_id": source_id,
                        "source_table": source_table,
                        "reason": reason[:2000],
                        "limit": QUARANTINE_AFTER_FAILURES,
                    },
                )
            ).mappings().first()
        return bool(row and row.get("quarantined_at") is not None)
    except Exception:
        logger.warning(
            "retention quarantine persist failed bucket=%s path=%s",
            bucket,
            path,
            exc_info=True,
        )
        return False


async def _clear_db_failure(engine: AsyncEngine, bucket: str, path: str) -> None:
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    delete from internal.media_retention_quarantine
                    where bucket = :bucket and object_path = :path
                    """
                ),
                {"bucket": bucket, "path": path},
            )
    except Exception:
        logger.warning(
            "retention quarantine clear failed bucket=%s path=%s",
            bucket,
            path,
            exc_info=True,
        )


async def _purge_due_media_rows(
    rows: Sequence[Mapping[str, Any]],
    *,
    storage: StorageProvider,
    mark_deleted: MarkDeleted,
    is_quarantined: Callable[[str, str], Awaitable[bool]],
    record_failure: Callable[[str, str, Any, str, str], Awaitable[bool]],
    clear_failure: Callable[[str, str], Awaitable[None]],
    counts: dict[str, Any],
) -> dict[str, Any]:
    """Delete due objects one by one. A single Storage 400 cannot abort the run."""
    for row in rows:
        bucket = str(row["bucket"])
        path = str(row["object_path"])
        source_id = row.get("source_id")
        source_table = str(row["source_table"])
        if await is_quarantined(bucket, path):
            counts["skipped"] += 1
            logger.info(
                "retention skipped quarantined object id=%s bucket=%s path=%s",
                source_id,
                bucket,
                path,
            )
            continue
        try:
            await storage.delete_object(bucket=bucket, path=path)
            if source_table != "orphan_object":
                await mark_deleted(row)
            await clear_failure(bucket, path)
            _count_deleted(counts, source_table)
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            logger.exception(
                "retention delete failed id=%s bucket=%s path=%s reason=%s",
                source_id,
                bucket,
                path,
                reason,
            )
            counts["failed"] += 1
            quarantined = await record_failure(
                bucket, path, source_id, source_table, reason
            )
            if quarantined:
                counts["quarantined"] += 1
                logger.error(
                    "retention object quarantined after %s failures id=%s bucket=%s path=%s",
                    QUARANTINE_AFTER_FAILURES,
                    source_id,
                    bucket,
                    path,
                )
    return _finalize_cleanup_counts(counts)


async def cleanup_expired_raw_media(
    store: InMemoryStore,
    *,
    storage: StorageProvider,
) -> dict:
    """Delete temporary raw objects past expires_at; keep diary/results."""
    now = now_utc()
    counts = _empty_cleanup_counts()
    tracker = _memory_failure_tracker(store)
    due: list[dict[str, Any]] = []

    for capture in store.captures.values():
        if (
            capture.retention_state == RetentionState.TEMPORARY
            and capture.expires_at is not None
            and capture.expires_at <= now
            and capture.storage_path
        ):
            due.append(
                {
                    "bucket": BEHAVIOR_BUCKET,
                    "object_path": capture.storage_path,
                    "source_id": capture.id,
                    "source_table": "behavior_captures",
                }
            )

    for event in store.fecal_events.values():
        if (
            event.retention_state == RetentionState.TEMPORARY
            and event.expires_at is not None
            and event.expires_at <= now
            and event.image_path
        ):
            due.append(
                {
                    "bucket": DIGESTIVE_BUCKET,
                    "object_path": event.image_path,
                    "source_id": event.id,
                    "source_table": "fecal_events",
                }
            )

    async def mark_deleted(row: Mapping[str, Any]) -> None:
        source_id = str(row["source_id"])
        if row["source_table"] == "behavior_captures":
            capture = store.captures.get(source_id)
            if capture is not None:
                capture.retention_state = RetentionState.DELETED
            return
        event = store.fecal_events.get(source_id)
        if event is not None:
            event.retention_state = RetentionState.DELETED

    async def is_quarantined(bucket: str, path: str) -> bool:
        return _is_memory_quarantined(tracker, bucket, path)

    async def record_failure(
        bucket: str, path: str, source_id: Any, source_table: str, reason: str
    ) -> bool:
        del source_id, source_table
        return _record_memory_failure(tracker, bucket=bucket, path=path, reason=reason)

    async def clear_failure(bucket: str, path: str) -> None:
        _clear_memory_failure(tracker, bucket, path)

    return await _purge_due_media_rows(
        due,
        storage=storage,
        mark_deleted=mark_deleted,
        is_quarantined=is_quarantined,
        record_failure=record_failure,
        clear_failure=clear_failure,
        counts=counts,
    )


async def cleanup_expired_raw_media_db(
    engine: AsyncEngine,
    *,
    storage: StorageProvider,
    limit: int = 100,
) -> dict:
    """Delete DB-tracked expired raw/export media and mark source rows purged."""
    async with engine.begin() as conn:
        stale_reservations = (
            await conn.execute(
                text(
                    """
                    select r.reference_id, r.domain
                    from internal.usage_reservations r
                    where r.state = 'RESERVED'
                      and r.created_at < now() - interval '2 hours'
                      and (
                        (
                          r.domain = 'BEHAVIOR'
                          and exists (
                            select 1
                            from public.behavior_events e
                            where e.id::text = r.reference_id
                              and e.status = 'UPLOADING'
                          )
                        )
                        or
                        (
                          r.domain = 'DIGESTIVE'
                          and exists (
                            select 1
                            from public.fecal_events f
                            where f.id::text = r.reference_id
                              and f.status = 'UPLOADING'
                          )
                        )
                      )
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
        ).mappings().all()

        for reservation in stale_reservations:
            reference_id = str(reservation["reference_id"])
            await conn.execute(
                text(
                    "select public.refund_usage(:reference_id, 'CANCELLED')"
                ),
                {"reference_id": reference_id},
            )
            if reservation["domain"] == "BEHAVIOR":
                await conn.execute(
                    text(
                        """
                        update public.behavior_events
                        set status = 'FAILED_TERMINAL',
                            last_error_code = 'UPLOAD_ABANDONED',
                            completed_at = coalesce(completed_at, now())
                        where id::text = :reference_id
                          and status = 'UPLOADING'
                        """
                    ),
                    {"reference_id": reference_id},
                )
                await conn.execute(
                    text(
                        """
                        update public.behavior_captures c
                        set expires_at = now()
                        from public.behavior_events e
                        where e.id::text = :reference_id
                          and c.id = e.capture_id
                          and c.retention_state = 'TEMPORARY'
                        """
                    ),
                    {"reference_id": reference_id},
                )
            else:
                await conn.execute(
                    text(
                        """
                        update public.fecal_events
                        set status = 'FAILED_TERMINAL',
                            last_error_code = 'UPLOAD_ABANDONED',
                            completed_at = coalesce(completed_at, now()),
                            expires_at = now()
                        where id::text = :reference_id
                          and status = 'UPLOADING'
                        """
                    ),
                    {"reference_id": reference_id},
                )

        purged_drafts = await conn.execute(
            text(
                """
                delete from public.owner_reported_observations
                where status = 'DRAFT'
                  and draft_expires_at <= now()
                """
            )
        )

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select bucket, object_path, source_id, source_table
                    from (
                      select bucket, object_path, source_id, source_table
                      from internal.media_due_for_deletion
                      union all
                      select bucket, object_path, source_id, source_table
                      from internal.storage_orphans_due_for_deletion
                    ) due
                    limit :limit
                    """
                ),
                {"limit": limit},
            )
        ).mappings().all()

    counts = _empty_cleanup_counts()
    counts["refunded_abandoned"] = len(stale_reservations)
    counts["purged_owner_story_drafts"] = max(purged_drafts.rowcount or 0, 0)

    async def mark_deleted(row: Mapping[str, Any]) -> None:
        async with engine.begin() as conn:
            await conn.execute(
                text("select internal.mark_media_deleted(:source_table, :source_id)"),
                {"source_table": row["source_table"], "source_id": row["source_id"]},
            )

    async def is_quarantined(bucket: str, path: str) -> bool:
        return await _is_db_quarantined(engine, bucket, path)

    async def record_failure(
        bucket: str, path: str, source_id: Any, source_table: str, reason: str
    ) -> bool:
        return await _record_db_failure(
            engine,
            bucket=bucket,
            path=path,
            source_id=source_id,
            source_table=source_table,
            reason=reason,
        )

    async def clear_failure(bucket: str, path: str) -> None:
        await _clear_db_failure(engine, bucket, path)

    return await _purge_due_media_rows(
        rows,
        storage=storage,
        mark_deleted=mark_deleted,
        is_quarantined=is_quarantined,
        record_failure=record_failure,
        clear_failure=clear_failure,
        counts=counts,
    )


async def arm_behavior_capture_expiry(engine: AsyncEngine, capture_id: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update public.behavior_captures
                set expires_at = internal.media_expiry_at('BEHAVIOR_RAW')
                where id = :capture_id
                  and retention_state = 'TEMPORARY'
                  and not coalesce((
                    select granted
                    from public.user_consents
                    where user_id = behavior_captures.user_id
                      and consent_type = 'MEDIA_RETENTION'
                    order by created_at desc, id desc
                    limit 1
                  ), false)
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
                  and not coalesce((
                    select granted
                    from public.user_consents
                    where user_id = fecal_events.user_id
                      and consent_type = 'MEDIA_RETENTION'
                    order by created_at desc, id desc
                    limit 1
                  ), false)
                """
            ),
            {"event_id": event_id},
        )
