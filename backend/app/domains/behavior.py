"""Behavior domain service: capture init/complete, event reads, feedback.

Implements the API-side of the state machine (sez. 7.2): DRAFT on init
(+ quota reservation), QUEUED on complete (after object validation + enqueue).
The worker owns OBSERVING/INTERPRETING/terminal transitions.
"""

from __future__ import annotations

from datetime import timedelta

from app.config import Settings
from app.contracts.api import BehaviorCaptureInitRequest, BehaviorFeedbackRequest
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain, BehaviorEventStatus
from app.domains.billing import QuotaService
from app.domains.dogs import get_owned_dog
from app.domains.models import (
    AnalysisJobRec,
    BehaviorCaptureRec,
    BehaviorEventRec,
    BehaviorFeedbackRec,
)
from app.domains.repository import InMemoryStore, new_id, now_utc
from app.providers.base import JobQueue, StorageProvider

BEHAVIOR_BUCKET = "behavior-raw"


def _storage_path(user_id: str, dog_id: str, event_id: str) -> str:
    """Server-generated object key (sez. 12.1): never client-supplied."""
    return f"users/{user_id}/dogs/{dog_id}/behavior/{event_id}/{new_id()}.mp4"


async def init_capture(
    store: InMemoryStore,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    payload: BehaviorCaptureInitRequest,
) -> tuple[BehaviorCaptureRec, BehaviorEventRec, str, object, bool]:
    """Create capture/event reservation + signed upload URL + quota
    reservation. Idempotent on (user, client_request_id) (sez. 22)."""
    dog = get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)

    # Media constraints (sez. 13).
    if payload.duration_ms < settings.min_video_duration_ms:
        raise ApiError(ErrorCode.VIDEO_TOO_SHORT, "Video is shorter than the minimum useful duration.")
    if payload.duration_ms > settings.max_video_duration_ms:
        raise ApiError(ErrorCode.VIDEO_TOO_LONG, "Video exceeds the maximum allowed duration.")

    # Duplicate client tap: return the existing reservation (sez. 22).
    existing_id = store.capture_by_client_request.get((user_id, payload.client_request_id))
    if existing_id:
        capture = store.captures[existing_id]
        event = next(e for e in store.behavior_events.values() if e.capture_id == capture.id)
        if event.status in (
            BehaviorEventStatus.DRAFT,
            BehaviorEventStatus.UPLOADING,
        ):
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

    # Atomic quota reservation BEFORE issuing the processing reservation (sez. 7.3).
    quota = QuotaService(store)
    await quota.reserve(user_id, AnalysisDomain.BEHAVIOR)

    capture_id, event_id = new_id(), new_id()
    path = _storage_path(user_id, dog.id, event_id)
    capture = BehaviorCaptureRec(
        id=capture_id,
        dog_id=dog.id,
        user_id=user_id,
        client_request_id=payload.client_request_id,
        storage_path=path,
        duration_ms=payload.duration_ms,
        has_audio=payload.has_audio,
        bytes=payload.bytes,
        content_type=payload.content_type,
        context_bucket=payload.context_bucket,
        expires_at=now_utc() + timedelta(hours=settings.raw_media_ttl_hours),
        created_at=now_utc(),
    )
    event = BehaviorEventRec(
        id=event_id,
        capture_id=capture_id,
        dog_id=dog.id,
        user_id=user_id,
        status=BehaviorEventStatus.UPLOADING,
        created_at=now_utc(),
    )
    store.captures[capture.id] = capture
    store.behavior_events[event.id] = event
    store.capture_by_client_request[(user_id, payload.client_request_id)] = capture_id

    url, expires = await storage.create_signed_upload_url(
        bucket=BEHAVIOR_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return capture, event, url, expires, True


async def complete_capture(
    store: InMemoryStore,
    *,
    settings: Settings,
    storage: StorageProvider,
    queue: JobQueue,
    user_id: str,
    capture_id: str,
) -> BehaviorEventRec:
    """Validate uploaded object then enqueue analysis (sez. 7.2 QUEUED).
    Idempotent: already-queued/processing events return their state."""
    capture = store.captures.get(capture_id)
    if capture is None or capture.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Capture not found")
    event = next(e for e in store.behavior_events.values() if e.capture_id == capture_id)

    if event.status not in (BehaviorEventStatus.UPLOADING, BehaviorEventStatus.DRAFT):
        return event  # idempotent no-op on duplicate complete

    ok = await storage.object_exists(
        bucket=BEHAVIOR_BUCKET, path=capture.storage_path, expected_bytes=capture.bytes
    )
    if not ok:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Uploaded object failed validation.", retryable=True)

    capture.upload_completed = True
    event.status = BehaviorEventStatus.QUEUED
    # Task payload is IDs only; no media bytes, no secrets (sez. 22).
    task_id = await queue.enqueue(
        task_type="behavior_analysis",
        payload={"event_id": event.id, "capture_id": capture.id, "user_id": user_id},
    )
    job = AnalysisJobRec(
        id=new_id(),
        job_type="behavior_analysis",
        event_id=event.id,
        user_id=user_id,
        task_id=task_id,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store.analysis_jobs[job.id] = job
    return event


def get_event(store: InMemoryStore, *, user_id: str, event_id: str) -> BehaviorEventRec:
    event = store.behavior_events.get(event_id)
    if event is None or event.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Event not found")
    return event


def record_feedback(
    store: InMemoryStore, *, user_id: str, event_id: str, payload: BehaviorFeedbackRequest
) -> BehaviorFeedbackRec:
    """Three-way feedback (sez. 6.1). Upsert per (event, user); owner only.
    Feedback is a useful label, not ground truth (sez. 17.1)."""
    get_event(store, user_id=user_id, event_id=event_id)
    existing = store.behavior_feedback.get(event_id)
    if existing and existing.user_id == user_id:
        updated = existing.model_copy(
            update={
                "value": payload.value,
                "correction_label": payload.correction_label,
                "corrected_context": payload.corrected_context,
                "updated_at": now_utc(),
            }
        )
        store.behavior_feedback[event_id] = updated
        return updated
    rec = BehaviorFeedbackRec(
        event_id=event_id,
        user_id=user_id,
        value=payload.value,
        correction_label=payload.correction_label,
        corrected_context=payload.corrected_context,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store.behavior_feedback[event_id] = rec
    return rec
