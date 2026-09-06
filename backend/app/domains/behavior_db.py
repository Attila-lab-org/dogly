"""PostgreSQL repository for behavior captures/events/feedback."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import Settings
from app.contracts.api import BehaviorCaptureInitRequest, BehaviorFeedbackRequest
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain, BehaviorEventStatus, FeedbackValue
from app.domains import dogs_db
from app.domains.billing import QuotaExceeded
from app.domains.db import reserve_usage_sql
from app.domains.models import (
    BehaviorCaptureRec,
    BehaviorEventRec,
    BehaviorFeedbackRec,
)
from app.domains.repository import new_id
from app.providers.base import JobQueue, StorageProvider

BEHAVIOR_BUCKET = "behavior-raw"


def _storage_path(user_id: str, dog_id: str, event_id: str) -> str:
    return f"users/{user_id}/dogs/{dog_id}/behavior/{event_id}/{new_id()}.mp4"


def _as_str(value: Any) -> str:
    return str(value)


def _capture_from_row(row: Any) -> BehaviorCaptureRec:
    data = dict(row)
    for key in ("id", "dog_id", "user_id"):
        data[key] = _as_str(data[key])
    return BehaviorCaptureRec.model_validate(data)


def _event_from_row(row: Any) -> BehaviorEventRec:
    data = dict(row)
    for key in ("id", "capture_id", "dog_id", "user_id"):
        data[key] = _as_str(data[key])
    return BehaviorEventRec.model_validate(data)


async def init_capture(
    engine: AsyncEngine,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    payload: BehaviorCaptureInitRequest,
) -> tuple[BehaviorCaptureRec, BehaviorEventRec, str, object, bool]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=payload.dog_id)

    if payload.duration_ms < settings.min_video_duration_ms:
        raise ApiError(ErrorCode.VIDEO_TOO_SHORT, "Video is shorter than the minimum useful duration.")
    if payload.duration_ms > settings.max_video_duration_ms:
        raise ApiError(ErrorCode.VIDEO_TOO_LONG, "Video exceeds the maximum allowed duration.")

    async with engine.begin() as conn:
        existing = (
            await conn.execute(
                text(
                    """
                    select c.id as capture_id
                    from public.behavior_captures c
                    where c.user_id = :user_id and c.client_request_id = :crid
                    """
                ),
                {"user_id": user_id, "crid": payload.client_request_id},
            )
        ).mappings().first()

        if existing:
            cap_row = (
                await conn.execute(
                    text("select * from public.behavior_captures where id = :id"),
                    {"id": existing["capture_id"]},
                )
            ).mappings().first()
            evt_row = (
                await conn.execute(
                    text("select * from public.behavior_events where capture_id = :cid"),
                    {"cid": existing["capture_id"]},
                )
            ).mappings().first()
            capture = _capture_from_row(cap_row)
            event = _event_from_row(evt_row)
            if event.status in (BehaviorEventStatus.DRAFT, BehaviorEventStatus.UPLOADING):
                url, expires = await storage.create_signed_upload_url(
                    bucket=BEHAVIOR_BUCKET,
                    path=capture.storage_path,
                    content_type=capture.content_type,
                    ttl_seconds=settings.storage_signed_url_ttl_seconds,
                )
                return capture, event, url, expires, False
            raise ApiError(
                ErrorCode.IDEMPOTENCY_CONFLICT,
                "A capture with this client_request_id is already being processed.",
            )

        capture_id, event_id = new_id(), new_id()
        # Prefer UUID string form accepted by Postgres uuid type.
        if len(capture_id) == 32:
            capture_id = f"{capture_id[:8]}-{capture_id[8:12]}-{capture_id[12:16]}-{capture_id[16:20]}-{capture_id[20:]}"
        if len(event_id) == 32:
            event_id = f"{event_id[:8]}-{event_id[8:12]}-{event_id[12:16]}-{event_id[16:20]}-{event_id[20:]}"
        path = _storage_path(user_id, payload.dog_id, event_id)

        # Reserve quota keyed by event_id (reference_id) BEFORE insert (sez. 7.3).
        reserved = await reserve_usage_sql(
            engine,
            user_id=user_id,
            domain=AnalysisDomain.BEHAVIOR.value,
            reference_id=event_id,
        )
        if not reserved.get("granted", False) and reserved.get("reason") not in (
            "ALREADY_RESERVED",
            "RESERVED",
        ):
            raise QuotaExceeded(AnalysisDomain.BEHAVIOR)

        await conn.execute(
            text(
                """
                insert into public.behavior_captures (
                  id, dog_id, user_id, client_request_id, storage_path, duration_ms,
                  has_audio, bytes, content_type, context_bucket, upload_completed
                ) values (
                  :id, :dog_id, :user_id, :client_request_id, :storage_path, :duration_ms,
                  :has_audio, :bytes, :content_type, :context_bucket, false
                )
                """
            ),
            {
                "id": capture_id,
                "dog_id": payload.dog_id,
                "user_id": user_id,
                "client_request_id": payload.client_request_id,
                "storage_path": path,
                "duration_ms": payload.duration_ms,
                "has_audio": payload.has_audio,
                "bytes": payload.bytes,
                "content_type": payload.content_type,
                "context_bucket": payload.context_bucket.value
                if hasattr(payload.context_bucket, "value")
                else payload.context_bucket,
            },
        )
        await conn.execute(
            text(
                """
                insert into public.behavior_events (
                  id, capture_id, dog_id, user_id, status, context_bucket
                ) values (
                  :id, :capture_id, :dog_id, :user_id, 'UPLOADING', :context_bucket
                )
                """
            ),
            {
                "id": event_id,
                "capture_id": capture_id,
                "dog_id": payload.dog_id,
                "user_id": user_id,
                "context_bucket": payload.context_bucket.value
                if hasattr(payload.context_bucket, "value")
                else payload.context_bucket,
            },
        )

        cap_row = (
            await conn.execute(text("select * from public.behavior_captures where id = :id"), {"id": capture_id})
        ).mappings().first()
        evt_row = (
            await conn.execute(text("select * from public.behavior_events where id = :id"), {"id": event_id})
        ).mappings().first()

    capture = _capture_from_row(cap_row)
    event = _event_from_row(evt_row)
    url, expires = await storage.create_signed_upload_url(
        bucket=BEHAVIOR_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return capture, event, url, expires, True



async def complete_capture(
    engine: AsyncEngine,
    *,
    settings: Settings,
    storage: StorageProvider,
    queue: JobQueue,
    user_id: str,
    capture_id: str,
) -> BehaviorEventRec:
    async with engine.begin() as conn:
        cap_row = (
            await conn.execute(
                text(
                    "select * from public.behavior_captures where id = :id and user_id = :user_id"
                ),
                {"id": capture_id, "user_id": user_id},
            )
        ).mappings().first()
        if not cap_row:
            raise ApiError(ErrorCode.NOT_FOUND, "Capture not found")
        capture = _capture_from_row(cap_row)
        evt_row = (
            await conn.execute(
                text("select * from public.behavior_events where capture_id = :cid"),
                {"cid": capture_id},
            )
        ).mappings().first()
        event = _event_from_row(evt_row)
        if event.status not in (BehaviorEventStatus.UPLOADING, BehaviorEventStatus.DRAFT):
            return event

    ok = await storage.object_exists(
        bucket=BEHAVIOR_BUCKET, path=capture.storage_path, expected_bytes=capture.bytes
    )
    if not ok:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Uploaded object failed validation.", retryable=True)

    task_id = await queue.enqueue(
        task_type="behavior_analysis",
        payload={"event_id": event.id, "capture_id": capture.id, "user_id": user_id},
    )
    job_id = new_id()
    if len(job_id) == 32:
        job_id = f"{job_id[:8]}-{job_id[8:12]}-{job_id[12:16]}-{job_id[16:20]}-{job_id[20:]}"

    async with engine.begin() as conn:
        await conn.execute(
            text("update public.behavior_captures set upload_completed = true where id = :id"),
            {"id": capture_id},
        )
        await conn.execute(
            text("update public.behavior_events set status = 'QUEUED' where id = :id"),
            {"id": event.id},
        )
        await conn.execute(
            text(
                """
                insert into internal.analysis_jobs (
                  id, job_type, domain, event_id, status, task_id
                ) values (
                  :id, 'BEHAVIOR_ANALYSIS', 'BEHAVIOR', :event_id, 'PENDING', :task_id
                )
                """
            ),
            {"id": job_id, "event_id": event.id, "task_id": task_id},
        )
    event.status = BehaviorEventStatus.QUEUED
    return event


async def get_event(engine: AsyncEngine, *, user_id: str, event_id: str) -> BehaviorEventRec:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    "select * from public.behavior_events where id = :id and user_id = :user_id"
                ),
                {"id": event_id, "user_id": user_id},
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Event not found")
    return _event_from_row(row)


async def record_feedback(
    engine: AsyncEngine, *, user_id: str, event_id: str, payload: BehaviorFeedbackRequest
) -> BehaviorFeedbackRec:
    await get_event(engine, user_id=user_id, event_id=event_id)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                insert into public.behavior_feedback (
                  event_id, user_id, value, correction_label, corrected_context, created_at, updated_at
                ) values (
                  :event_id, :user_id, :value, :correction_label, :corrected_context, now(), now()
                )
                on conflict (event_id) do update set
                  value = excluded.value,
                  correction_label = excluded.correction_label,
                  corrected_context = excluded.corrected_context,
                  updated_at = now()
                """
            ),
            {
                "event_id": event_id,
                "user_id": user_id,
                "value": payload.value.value if hasattr(payload.value, "value") else payload.value,
                "correction_label": payload.correction_label.value
                if getattr(payload, "correction_label", None) is not None
                and hasattr(payload.correction_label, "value")
                else payload.correction_label,
                "corrected_context": payload.corrected_context.value
                if getattr(payload, "corrected_context", None) is not None
                and hasattr(payload.corrected_context, "value")
                else payload.corrected_context,
            },
        )
        row = (
            await conn.execute(
                text("select * from public.behavior_feedback where event_id = :event_id"),
                {"event_id": event_id},
            )
        ).mappings().first()
    data = dict(row)
    data["event_id"] = str(data["event_id"])
    data["user_id"] = str(data["user_id"])
    return BehaviorFeedbackRec.model_validate(data)


async def get_feedback_value(
    engine: AsyncEngine, *, user_id: str, event_id: str
) -> FeedbackValue | None:
    async with engine.connect() as conn:
        value = (
            await conn.execute(
                text(
                    """
                    select value
                    from public.behavior_feedback
                    where event_id = :event_id
                      and user_id = cast(:user_id as uuid)
                    """
                ),
                {"event_id": event_id, "user_id": user_id},
            )
        ).scalar_one_or_none()
    return FeedbackValue(str(value)) if value is not None else None


async def save_event_state(engine: AsyncEngine, event: BehaviorEventRec) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update public.behavior_events set
                  status = :status,
                  primary_intent = :primary_intent,
                  confidence_band = :confidence_band,
                  summary = :summary,
                  observation_json = CAST(:observation_json AS jsonb),
                  interpretation_json = CAST(:interpretation_json AS jsonb),
                  policy_version = :policy_version,
                  taxonomy_version = :taxonomy_version,
                  knowledge_version = :knowledge_version,
                  knowledge_card_ids = cast(:knowledge_card_ids as text[]),
                  advice_code = :advice_code,
                  advice_json = cast(:advice_json as jsonb),
                  quota_committed = :quota_committed,
                  quota_refunded = :quota_refunded,
                  attempt_count = :attempt_count,
                  last_error_code = :last_error_code,
                  completed_at = :completed_at
                where id = :id and user_id = :user_id
                """
            ),
            {
                "id": event.id,
                "user_id": event.user_id,
                "status": event.status.value if hasattr(event.status, "value") else event.status,
                "primary_intent": event.primary_intent.value
                if getattr(event, "primary_intent", None) is not None
                and hasattr(event.primary_intent, "value")
                else event.primary_intent,
                "confidence_band": event.confidence_band.value
                if getattr(event, "confidence_band", None) is not None
                and hasattr(event.confidence_band, "value")
                else event.confidence_band,
                "summary": event.summary,
                "observation_json": json.dumps(event.observation_json) if event.observation_json else None,
                "interpretation_json": json.dumps(event.interpretation_json)
                if event.interpretation_json
                else None,
                "policy_version": event.policy_version,
                "taxonomy_version": event.taxonomy_version,
                "knowledge_version": event.knowledge_version,
                "knowledge_card_ids": event.knowledge_card_ids,
                "advice_code": event.advice_code,
                "advice_json": json.dumps(event.advice_json) if event.advice_json else None,
                "quota_committed": event.quota_committed,
                "quota_refunded": event.quota_refunded,
                "attempt_count": event.attempt_count,
                "last_error_code": event.last_error_code,
                "completed_at": event.completed_at,
            },
        )


async def load_event(engine: AsyncEngine, *, event_id: str) -> BehaviorEventRec | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("select * from public.behavior_events where id = :id"),
                {"id": event_id},
            )
        ).mappings().first()
    return _event_from_row(row) if row else None


async def load_capture(engine: AsyncEngine, *, capture_id: str) -> BehaviorCaptureRec | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("select * from public.behavior_captures where id = :id"),
                {"id": capture_id},
            )
        ).mappings().first()
    return _capture_from_row(row) if row else None
