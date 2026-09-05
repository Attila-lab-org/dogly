"""Private worker handlers (Spec V1 sez. 8.2 / 7.2 / 14).

Push-based retryable task handlers behind an internal-only HTTP surface.
Semantics:
- Acquire the event; terminal completed state is a no-op on duplicate
  delivery (sez. 22: duplicate queue delivery).
- observer -> reasoner orchestration with validated contracts.
- COMPLETED commits the quota reservation; REJECTED_QUALITY (before
  meaningful AI work) and FAILED_TERMINAL refund it (sez. 7.3).
- The worker NEVER mutates Personal Patterns from generative output; pattern
  updates go through the deterministic Personal Intelligence service.
"""

from __future__ import annotations

import gzip
import json

from app.api.deps import AppState
from app.contracts.errors import ErrorCode
from app.contracts.taxonomy import (
    BEHAVIOR_EVENT_TRANSITIONS,
    ELIGIBLE_PATTERN_STATES,
    INTERPRETATION_POLICY_VERSION,
    TERMINAL_EVENT_STATUSES,
    AnalysisDomain,
    BehaviorEventStatus,
)
from app.domains import behavior_db, digestive_db, patterns_db, privacy_db
from app.domains import privacy as privacy_domain
from app.domains.billing import QuotaService
from app.domains.digestive import deterministic_safety_flags
from app.domains.models import BehaviorEventRec
from app.domains.repository import now_utc
from app.domains.retention import (
    arm_behavior_capture_expiry,
    arm_fecal_expiry,
    cleanup_expired_raw_media,
    cleanup_expired_raw_media_db,
    schedule_behavior_raw_expiry,
    schedule_digestive_raw_expiry,
)
from app.providers import supabase_auth_admin
from app.providers.base import EligiblePatternSummary

MAX_TASK_ATTEMPTS = 5


class InvalidTransition(Exception):
    pass


def transition(event: BehaviorEventRec, to: BehaviorEventStatus) -> None:
    """Enforce the behavior state machine (sez. 7.2 / Appendix A)."""
    allowed = BEHAVIOR_EVENT_TRANSITIONS.get(event.status, frozenset())
    if to not in allowed:
        raise InvalidTransition(f"{event.status} -> {to} is not an allowed transition")
    event.status = to


async def _eligible_memory(state: AppState, dog_id: str) -> list[EligiblePatternSummary]:
    """Only eligible pattern summaries reach the reasoner (sez. 16.1/17.2);
    never the unfiltered history."""
    if state.engine is not None:
        return await patterns_db.list_eligible_for_reasoner(state.engine, dog_id=dog_id)
    return [
        EligiblePatternSummary(
            pattern_id=p.id,
            state=p.state.value,
            title=p.title,
            support_summary=f"support={p.support_count} confirm={p.confirm_count}",
        )
        for p in state.store.patterns.values()
        if p.dog_id == dog_id and p.state in ELIGIBLE_PATTERN_STATES
    ]


async def _arm_behavior_raw_ttl(state: AppState, event: BehaviorEventRec) -> None:
    if state.engine is not None:
        await arm_behavior_capture_expiry(state.engine, event.capture_id)
        return
    capture = state.store.captures.get(event.capture_id)
    if capture is not None:
        schedule_behavior_raw_expiry(capture, state.settings)


async def _fail(state: AppState, event: BehaviorEventRec, code: ErrorCode, retryable: bool) -> dict:
    event.last_error_code = code.value
    quota = QuotaService(state.store, engine=state.engine)
    if retryable and event.attempt_count < MAX_TASK_ATTEMPTS:
        transition(event, BehaviorEventStatus.FAILED_RETRYABLE)
        if state.engine is not None:
            await behavior_db.save_event_state(state.engine, event)
        return {"event_id": event.id, "status": event.status.value, "error": code.value}
    # Terminal: refund the reservation once (sez. 7.3 / 22).
    if event.status == BehaviorEventStatus.FAILED_RETRYABLE or event.status in (BehaviorEventStatus.OBSERVING, BehaviorEventStatus.INTERPRETING):
        transition(event, BehaviorEventStatus.FAILED_TERMINAL)
    else:
        raise InvalidTransition(f"cannot fail terminally from {event.status}")
    if not event.quota_refunded and not event.quota_committed:
        await quota.refund(event.user_id, AnalysisDomain.BEHAVIOR, reference_id=event.id)
        event.quota_refunded = True
    event.completed_at = now_utc()
    await _arm_behavior_raw_ttl(state, event)
    if state.engine is not None:
        await behavior_db.save_event_state(state.engine, event)
    return {"event_id": event.id, "status": event.status.value, "error": code.value}


async def process_behavior_event(state: AppState, *, event_id: str) -> dict:
    """Behavior analysis handler: QUEUED -> OBSERVING -> INTERPRETING ->
    COMPLETED / REJECTED_QUALITY / FAILED_* (sez. 7.2). Idempotent."""
    if state.engine is not None:
        event = await behavior_db.load_event(state.engine, event_id=event_id)
        if event is None:
            return {"event_id": event_id, "status": "ignored_unknown_event"}
        # Mirror into memory for helpers that still read store (TTL arming).
        state.store.behavior_events[event.id] = event
        capture = await behavior_db.load_capture(state.engine, capture_id=event.capture_id)
        if capture is None:
            return {"event_id": event_id, "status": "ignored_unknown_capture"}
        state.store.captures[capture.id] = capture
    else:
        event = state.store.behavior_events.get(event_id)
        if event is None:
            return {"event_id": event_id, "status": "ignored_unknown_event"}
        capture = state.store.captures[event.capture_id]

    if event.status in TERMINAL_EVENT_STATUSES:
        return {"event_id": event.id, "status": event.status.value, "noop": True}

    event.attempt_count += 1
    quota = QuotaService(state.store, engine=state.engine)

    # QUEUED -> OBSERVING (or FAILED_RETRYABLE -> OBSERVING retry).
    transition(event, BehaviorEventStatus.OBSERVING)
    if state.engine is not None:
        await behavior_db.save_event_state(state.engine, event)
    try:
        video_ref = capture.storage_path
        # Real observers need an HTTPS media URI; mint a short-lived signed read URL.
        create_read = getattr(state.storage, "create_signed_read_url", None)
        if callable(create_read) and state.settings.observer_provider != "mock":
            from app.domains.behavior import BEHAVIOR_BUCKET

            video_ref = await create_read(
                bucket=BEHAVIOR_BUCKET,
                path=capture.storage_path,
                ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 600),
            )
        observation, obs_usage = await state.observer.observe(
            video_ref=video_ref,
            policy_version=INTERPRETATION_POLICY_VERSION,
            duration_ms=capture.duration_ms,
        )
    except TimeoutError:
        return await _fail(state, event, ErrorCode.PROVIDER_TIMEOUT, retryable=True)
    except Exception:  # noqa: BLE001 -- deliberate: any non-timeout provider/observer
        # failure maps to a retryable job failure (sez. 22), never crashes the worker.
        return await _fail(state, event, ErrorCode.PROCESSING_FAILED, retryable=True)
    await state.cost_meter.record(
        usage=obs_usage,
        operation="observer.observe",
        domain=AnalysisDomain.BEHAVIOR,
        event_id=event.id,
        user_id=event.user_id,
    )
    event.observation_json = observation.model_dump(mode="json")

    # Server/provider quality gate (sez. 13): dog not observable -> reject
    # before meaningful AI work and refund the reservation (sez. 7.3).
    quality = observation.capture_quality
    if quality.overall_quality == "insufficient" or (quality.dog_visible_fraction or 0.0) <= 0.0:
        transition(event, BehaviorEventStatus.REJECTED_QUALITY)
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(event.user_id, AnalysisDomain.BEHAVIOR, reference_id=event.id)
            event.quota_refunded = True
        event.completed_at = now_utc()
        await _arm_behavior_raw_ttl(state, event)
        if state.engine is not None:
            await behavior_db.save_event_state(state.engine, event)
        return {"event_id": event.id, "status": event.status.value}

    # OBSERVING -> INTERPRETING
    transition(event, BehaviorEventStatus.INTERPRETING)
    try:
        interpretation, rea_usage = await state.reasoner.interpret(
            observation=observation,
            context_bucket=capture.context_bucket,
            policy_version=INTERPRETATION_POLICY_VERSION,
            eligible_memory=await _eligible_memory(state, event.dog_id),
        )
    except TimeoutError:
        return await _fail(state, event, ErrorCode.PROVIDER_TIMEOUT, retryable=True)
    except Exception:  # noqa: BLE001 -- deliberate: schema/validation/provider errors
        # follow the one-repair-then-terminal path (sez. 22), never crash the worker.
        return await _fail(state, event, ErrorCode.PROVIDER_SCHEMA_INVALID, retryable=True)
    await state.cost_meter.record(
        usage=rea_usage,
        operation="reasoner.interpret",
        domain=AnalysisDomain.BEHAVIOR,
        event_id=event.id,
        user_id=event.user_id,
    )

    # INTERPRETING -> COMPLETED: persist event + finalize quota (sez. 7.2).
    transition(event, BehaviorEventStatus.COMPLETED)
    event.interpretation_json = interpretation.model_dump(mode="json")
    event.primary_intent = interpretation.primary_intent
    event.confidence_band = interpretation.confidence_band
    event.summary = interpretation.consumer_summary
    event.policy_version = interpretation.policy_version
    event.taxonomy_version = interpretation.taxonomy_version
    event.completed_at = now_utc()
    if not event.quota_committed and not event.quota_refunded:
        await quota.commit(event.user_id, AnalysisDomain.BEHAVIOR, reference_id=event.id)
        event.quota_committed = True
    await _arm_behavior_raw_ttl(state, event)
    if state.engine is not None:
        await behavior_db.save_event_state(state.engine, event)
    return {"event_id": event.id, "status": event.status.value}


async def process_digestive_event(state: AppState, *, event_id: str) -> dict:
    """Digestive analysis handler (sez. 19). Observation is separate from the
    deterministic safety layer; completed events are a no-op on redelivery."""
    if state.engine is not None:
        event = await digestive_db.load_fecal_event(state.engine, event_id=event_id)
        if event is not None:
            state.store.fecal_events[event.id] = event
    else:
        event = state.store.fecal_events.get(event_id)
    if event is None:
        return {"event_id": event_id, "status": "ignored_unknown_event"}
    if event.status in ("COMPLETED", "REJECTED_QUALITY", "FAILED_TERMINAL"):
        return {"event_id": event.id, "status": event.status, "noop": True}

    quota = QuotaService(state.store, engine=state.engine)
    event.status = "OBSERVING"
    if state.engine is not None:
        await digestive_db.save_fecal_state(state.engine, event)
    try:
        image_ref = event.image_path
        create_read = getattr(state.storage, "create_signed_read_url", None)
        if callable(create_read) and state.settings.digestive_vision_provider != "mock":
            from app.domains.digestive import DIGESTIVE_BUCKET

            image_ref = await create_read(
                bucket=DIGESTIVE_BUCKET,
                path=event.image_path,
                ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 600),
            )
        observation, usage = await state.digestive_vision.observe_stool(image_ref=image_ref)
    except TimeoutError:
        event.status = "FAILED_RETRYABLE"
        if state.engine is not None:
            await digestive_db.save_fecal_state(state.engine, event)
        return {"event_id": event.id, "status": event.status, "error": ErrorCode.PROVIDER_TIMEOUT.value}
    except Exception:  # noqa: BLE001 -- deliberate: any digestive-vision failure is a
        # terminal event with quota refund (sez. 22), never crashes the worker.
        event.status = "FAILED_TERMINAL"
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(event.user_id, AnalysisDomain.DIGESTIVE, reference_id=event.id)
            event.quota_refunded = True
        event.completed_at = now_utc()
        schedule_digestive_raw_expiry(event, state.settings)
        if state.engine is not None:
            await digestive_db.save_fecal_state(state.engine, event)
            await arm_fecal_expiry(state.engine, event.id)
        return {"event_id": event.id, "status": event.status, "error": ErrorCode.PROVIDER_SCHEMA_INVALID.value}
    await state.cost_meter.record(
        usage=usage,
        operation="digestive_vision.observe_stool",
        domain=AnalysisDomain.DIGESTIVE,
        event_id=event.id,
        user_id=event.user_id,
    )

    obs_json = observation.model_dump(mode="json")
    event.observation_json = obs_json
    if observation.image_quality == "insufficient":
        event.status = "REJECTED_QUALITY"
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(event.user_id, AnalysisDomain.DIGESTIVE, reference_id=event.id)
            event.quota_refunded = True
        event.completed_at = now_utc()
        schedule_digestive_raw_expiry(event, state.settings)
        if state.engine is not None:
            await digestive_db.save_fecal_state(state.engine, event)
            await arm_fecal_expiry(state.engine, event.id)
        return {"event_id": event.id, "status": event.status}

    event.fecal_score_estimate = observation.fecal_score_estimate
    event.consistency = observation.consistency.value
    event.color = observation.color
    event.confidence_band = observation.confidence_band
    # Deterministic safety routing (sez. 19.3): flags come from rules, not
    # from free-form generated text.
    event.safety_flags = deterministic_safety_flags(obs_json)
    event.summary = (
        f"Osservazione fecale: consistenza {observation.consistency.value}, "
        f"punteggio stimato {observation.fecal_score_estimate}/7."
    )
    event.status = "COMPLETED"
    event.completed_at = now_utc()
    if not event.quota_committed and not event.quota_refunded:
        await quota.commit(event.user_id, AnalysisDomain.DIGESTIVE, reference_id=event.id)
        event.quota_committed = True
    schedule_digestive_raw_expiry(event, state.settings)
    if state.engine is not None:
        await digestive_db.save_fecal_state(state.engine, event)
        await arm_fecal_expiry(state.engine, event.id)
    return {"event_id": event.id, "status": event.status}


async def process_media_retention_cleanup(state: AppState, *, event_id: str | None = None) -> dict:
    """Periodic cleanup of expired temporary raw media (IDs-only task)."""
    del event_id  # unused; cleanup scans the store
    if state.engine is not None:
        return await cleanup_expired_raw_media_db(state.engine, storage=state.storage)
    return await cleanup_expired_raw_media(state.store, storage=state.storage)


async def process_privacy_export(state: AppState, *, event_id: str) -> dict:
    """Build a gzip JSON export artifact and complete the export job."""
    job = (
        await privacy_db.claim_export_job(state.engine, event_id)
        if state.engine is not None
        else privacy_domain.claim_export_job(state.store, event_id)
    )
    if job is None:
        return {"event_id": event_id, "status": "ignored_unclaimable_job", "noop": True}
    try:
        payload = (
            await privacy_db.collect_export_payload(state.engine, job.user_id or "")
            if state.engine is not None
            else privacy_domain.collect_export_payload(state.store, job.user_id or "")
        )
        data = gzip.compress(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
        path = f"users/{job.user_id}/exports/{job.id}.json.gz"
        await state.storage.upload_bytes(
            bucket="exports",
            path=path,
            data=data,
            content_type="application/gzip",
        )
        if state.engine is not None:
            expires_at = await privacy_db.export_expires_at(state.engine)
            await privacy_db.complete_export_job(
                state.engine,
                job.id,
                storage_path=path,
                expires_at=expires_at,
            )
        else:
            from datetime import UTC, datetime, timedelta

            privacy_domain.complete_export_job(
                state.store,
                job.id,
                storage_path=path,
                expires_at=datetime.now(UTC) + timedelta(days=7),
            )
        return {"event_id": job.id, "status": "COMPLETED", "storage_path": path}
    except Exception as exc:
        if state.engine is not None:
            await privacy_db.fail_export_job(state.engine, job.id, str(exc))
        else:
            privacy_domain.fail_export_job(state.store, job.id, str(exc))
        raise


def _purge_memory_account(state: AppState, user_id: str) -> dict[str, int]:
    dog_ids = {dog.id for dog in state.store.dogs.values() if dog.owner_id == user_id}
    counts = {
        "profiles": int(user_id in state.store.profiles),
        "dogs": len(dog_ids),
        "behavior_captures": sum(1 for rec in state.store.captures.values() if rec.user_id == user_id),
        "behavior_events": sum(1 for rec in state.store.behavior_events.values() if rec.user_id == user_id),
        "fecal_events": sum(1 for rec in state.store.fecal_events.values() if rec.user_id == user_id),
        "food_products": sum(1 for rec in state.store.food_products.values() if rec.owner_id == user_id),
        "feeding_periods": sum(1 for rec in state.store.feeding_periods.values() if rec.dog_id in dog_ids),
    }
    state.store.profiles.pop(user_id, None)
    for collection, predicate in (
        (state.store.dogs, lambda rec: rec.owner_id == user_id),
        (state.store.captures, lambda rec: rec.user_id == user_id),
        (state.store.behavior_events, lambda rec: rec.user_id == user_id),
        (state.store.fecal_events, lambda rec: rec.user_id == user_id),
        (state.store.food_products, lambda rec: rec.owner_id == user_id),
        (state.store.feeding_periods, lambda rec: rec.dog_id in dog_ids),
        (state.store.subscriptions, lambda rec: rec.user_id == user_id),
        (state.store.devices, lambda rec: rec.user_id == user_id),
    ):
        for rec_id, rec in list(collection.items()):
            if predicate(rec):
                collection.pop(rec_id, None)
    return counts


async def process_account_deletion(state: AppState, *, event_id: str) -> dict:
    """Purge account storage/data and complete the deletion job with count evidence."""
    job = (
        await privacy_db.claim_deletion_job(state.engine, event_id)
        if state.engine is not None
        else privacy_domain.claim_deletion_job(state.store, event_id)
    )
    if job is None:
        return {"event_id": event_id, "status": "ignored_unclaimable_job", "noop": True}
    try:
        user_id = job.user_id or ""
        paths = (
            await privacy_db.list_storage_paths_for_user(state.engine, user_id)
            if state.engine is not None
            else privacy_domain.list_storage_paths_for_user(state.store, user_id)
        )
        deleted_objects = 0
        for item in paths:
            await state.storage.delete_object(bucket=item["bucket"], path=item["path"])
            deleted_objects += 1
        if state.engine is not None:
            counts = await privacy_db.count_user_rows(state.engine, user_id)
            await supabase_auth_admin.delete_user(state.settings, user_id)
            evidence = {"storage_objects_deleted": deleted_objects, "rows_deleted": counts}
            await privacy_db.complete_deletion_job(state.engine, job.id, evidence)
        else:
            counts = _purge_memory_account(state, user_id)
            evidence = {"storage_objects_deleted": deleted_objects, "rows_deleted": counts}
            privacy_domain.complete_deletion_job(state.store, job.id)
        return {"event_id": job.id, "status": "COMPLETED", **evidence}
    except Exception as exc:
        if state.engine is not None:
            await privacy_db.fail_deletion_job(state.engine, job.id, str(exc))
        else:
            privacy_domain.fail_deletion_job(state.store, job.id, str(exc))
        raise
