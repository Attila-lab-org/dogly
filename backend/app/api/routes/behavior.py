"""Behavior routes (sez. 9): capture init/complete, event read, feedback."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    BehaviorCaptureInitRequest,
    BehaviorCaptureInitResponse,
    BehaviorEventOut,
    BehaviorFeedbackRequest,
    BehaviorFeedbackResponse,
    CaptureCompleteResponse,
)
from app.contracts.taxonomy import FeedbackValue
from app.domains import behavior as behavior_domain
from app.domains import behavior_db, idempotency_db
from app.domains.models import BehaviorEventRec

router = APIRouter()


def event_out(
    event: BehaviorEventRec, feedback: FeedbackValue | None = None
) -> BehaviorEventOut:
    interp = event.interpretation_json or {}
    return BehaviorEventOut(
        id=event.id,
        dog_id=event.dog_id,
        status=event.status,
        primary_intent=event.primary_intent,
        confidence_band=event.confidence_band,
        summary=event.summary,
        alternatives=interp.get("alternatives", []),
        evidence=interp.get("evidence", []),
        safety_flags=interp.get("safety_flags", []),
        needs_context=interp.get("needs_context", False),
        context_question=interp.get("context_question"),
        policy_version=event.policy_version,
        taxonomy_version=event.taxonomy_version,
        feedback=feedback,
        created_at=event.created_at,
        completed_at=event.completed_at,
    )


async def _record_guard(state: StateDep, guard: IdempotencyDep, body: dict) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


@router.post("/behavior/captures/init", response_model=BehaviorCaptureInitResponse)
async def init_capture(
    payload: BehaviorCaptureInitRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> BehaviorCaptureInitResponse:
    if cached := guard.lookup():
        return BehaviorCaptureInitResponse.model_validate(cached)
    if state.engine is not None:
        capture, event, url, expires, reserved = await behavior_db.init_capture(
            state.engine,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            payload=payload,
        )
    else:
        capture, event, url, expires, reserved = await behavior_domain.init_capture(
            state.store,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            payload=payload,
        )
    resp = BehaviorCaptureInitResponse(
        capture_id=capture.id,
        event_id=event.id,
        status=event.status,
        upload={"url": url, "storage_path": capture.storage_path, "expires_at": expires},
        quota_reserved=reserved,
    )
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


@router.post("/behavior/captures/{capture_id}/complete", response_model=CaptureCompleteResponse)
async def complete_capture(
    capture_id: str,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> CaptureCompleteResponse:
    if cached := guard.lookup():
        return CaptureCompleteResponse.model_validate(cached)
    if state.engine is not None:
        event = await behavior_db.complete_capture(
            state.engine,
            settings=state.settings,
            storage=state.storage,
            queue=state.queue,
            user_id=user_id,
            capture_id=capture_id,
        )
    else:
        event = await behavior_domain.complete_capture(
            state.store,
            settings=state.settings,
            storage=state.storage,
            queue=state.queue,
            user_id=user_id,
            capture_id=capture_id,
        )
    resp = CaptureCompleteResponse(capture_id=capture_id, event_id=event.id, status=event.status)
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


@router.get("/behavior/events/{event_id}", response_model=BehaviorEventOut)
async def get_behavior_event(event_id: str, state: StateDep, user_id: UserIdDep) -> BehaviorEventOut:
    if state.engine is not None:
        event = await behavior_db.get_event(state.engine, user_id=user_id, event_id=event_id)
        feedback = await behavior_db.get_feedback_value(
            state.engine, user_id=user_id, event_id=event_id
        )
    else:
        event = behavior_domain.get_event(state.store, user_id=user_id, event_id=event_id)
        rec = state.store.behavior_feedback.get(event_id)
        feedback = rec.value if rec is not None and rec.user_id == user_id else None
    return event_out(event, feedback)


@router.post("/behavior/events/{event_id}/feedback", response_model=BehaviorFeedbackResponse)
async def post_feedback(
    event_id: str,
    payload: BehaviorFeedbackRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> BehaviorFeedbackResponse:
    if cached := guard.lookup():
        return BehaviorFeedbackResponse.model_validate(cached)
    if state.engine is not None:
        rec = await behavior_db.record_feedback(
            state.engine, user_id=user_id, event_id=event_id, payload=payload
        )
    else:
        rec = behavior_domain.record_feedback(
            state.store, user_id=user_id, event_id=event_id, payload=payload
        )
    resp = BehaviorFeedbackResponse(event_id=event_id, value=rec.value)
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp
