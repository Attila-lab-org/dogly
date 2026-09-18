"""Behavior routes (sez. 9): capture init/complete, event read, feedback."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends

from app.api.deps import IdempotencyDep, StateDep, UserIdDep, rate_limit
from app.contracts.api import (
    BehaviorCaptureInitRequest,
    BehaviorCaptureInitResponse,
    BehaviorContextUpdateRequest,
    BehaviorEventOut,
    BehaviorFeedbackRequest,
    BehaviorFeedbackResponse,
    CaptureCompleteResponse,
    ProcessingContextAnswerRequest,
    ProcessingContextOption,
    ProcessingContextOut,
    ProcessingContextQuestion,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import (
    INTERPRETATION_SCHEMA_VERSION,
    FeedbackValue,
    IntentCode,
)
from app.domains import behavior as behavior_domain
from app.domains import (
    behavior_db,
    idempotency_db,
    lifestyle,
    lifestyle_db,
    processing_context_store,
)
from app.domains.behavior_intelligence import (
    BEHAVIOR_CONSUMER_VERSION,
    behavior_meaning_copy,
)
from app.domains.context_bucket import resolve_context_bucket
from app.domains.models import BehaviorEventRec
from app.domains.processing_context import (
    MAX_PROCESSING_QUESTIONS,
    PLANNER_VERSION,
    is_collecting_status,
    owner_facts_for_reasoner,
    plan_next_question,
    resolve_question,
)
from app.knowledge.advice import alert_vigilance_advice
from app.knowledge.models import AdviceOutcomeValue

router = APIRouter()


def _partial_reading_is_useful(interp: dict, consumer: dict) -> bool:
    """Keep grounded partial readings created before the latest composer."""
    observed = sum(
        isinstance(item, dict) and item.get("source") == "observation"
        for item in interp.get("evidence", [])
    )
    return (
        interp.get("primary_intent") in {None, "INSUFFICIENT"}
        and observed >= 2
        and bool(interp.get("alternatives"))
        and bool(interp.get("consumer_headline"))
        and bool(interp.get("dog_voice"))
        and not consumer.get("safety")
    )


def _legacy_dog_name(interp: dict, consumer: dict) -> str:
    copy = str(
        consumer.get("consumer_headline")
        or interp.get("consumer_headline")
        or ""
    )
    match = re.match(r"^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{1,30})\b", copy)
    if not match or match.group(1).casefold() in {
        "potrebbe",
        "sembra",
        "non",
        "ci",
    }:
        return "Il cane"
    return match.group(1)


def _effective_legacy_intent(
    event: BehaviorEventRec,
    interp: dict,
    *,
    partial_but_useful: bool,
) -> IntentCode | None:
    raw = event.primary_intent
    if partial_but_useful:
        alternatives = interp.get("alternatives") or []
        if alternatives and isinstance(alternatives[0], dict):
            raw = alternatives[0].get("intent")
    if raw is None:
        return None
    try:
        return IntentCode(raw)
    except ValueError:
        return None


def _sound_note(event: BehaviorEventRec, interp: dict) -> str | None:
    if interp.get("sound_note"):
        return str(interp["sound_note"])
    observation = event.observation_json or {}
    vocalization = observation.get("vocalization") or {}
    candidates = [
        value
        for value in vocalization.get("type_candidates", [])
        if value in {"bark", "growl", "whine", "whimper", "howl"}
    ]
    if not candidates:
        return None
    label = {
        "bark": "un possibile abbaio",
        "growl": "un possibile ringhio",
        "whine": "un possibile guaito",
        "whimper": "un possibile lamento",
        "howl": "un possibile ululato",
    }[candidates[0]]
    audio_quality = (observation.get("capture_quality") or {}).get(
        "audio_quality"
    )
    if audio_quality in {"degraded", "insufficient", "unknown"}:
        return (
            f"L’audio sembra contenere {label}, ma non è abbastanza nitido "
            "per descriverlo con precisione."
        )
    return (
        f"Si sente {label}. Da solo non ha un significato fisso: "
        "va letto insieme alla postura e a ciò che sta accadendo."
    )


def event_out(
    event: BehaviorEventRec,
    feedback: FeedbackValue | None = None,
    advice_outcome: AdviceOutcomeValue | None = None,
) -> BehaviorEventOut:
    interp = event.interpretation_json or {}
    consumer = dict(interp.get("consumer") or {})
    partial_but_useful = _partial_reading_is_useful(interp, consumer)
    effective_intent = _effective_legacy_intent(
        event,
        interp,
        partial_but_useful=partial_but_useful,
    )
    legacy_consumer = (
        bool(consumer)
        and consumer.get("composer_version") != BEHAVIOR_CONSUMER_VERSION
    )
    if legacy_consumer:
        headline, summary, dog_voice = behavior_meaning_copy(
            _legacy_dog_name(interp, consumer),
            effective_intent,
        )
    else:
        headline = consumer.get("consumer_headline")
        summary = consumer.get("consumer_summary") or event.summary
        dog_voice = consumer.get("dog_voice") or interp.get("dog_voice")
    advice = event.advice_json or interp.get("advice")
    recommended_next_step = (
        None
        if partial_but_useful and interp.get("needs_context")
        else consumer.get("recommended_next_step")
    )
    if (
        legacy_consumer
        and effective_intent is IntentCode.ALERT_VIGILANCE
        and not interp.get("needs_context")
        and not consumer.get("safety")
    ):
        upgraded_advice = alert_vigilance_advice()
        advice = upgraded_advice.model_dump(mode="json")
        recommended_next_step = upgraded_advice.action
    return BehaviorEventOut(
        id=event.id,
        dog_id=event.dog_id,
        status=event.status,
        schema_version=interp.get("schema_version", INTERPRETATION_SCHEMA_VERSION),
        primary_intent=event.primary_intent,
        confidence_band=event.confidence_band,
        summary=summary,
        alternatives=(
            consumer["consumer_alternatives"]
            if "consumer_alternatives" in consumer
            else interp.get("alternatives", [])
        ),
        evidence=(
            consumer["consumer_evidence"]
            if "consumer_evidence" in consumer
            else interp.get("evidence", [])
        ),
        safety_flags=interp.get("safety_flags", []),
        needs_context=interp.get("needs_context", False),
        context_question=interp.get("context_question"),
        context_options=interp.get("context_options", []),
        context_effect=interp.get("context_effect"),
        dog_voice=dog_voice,
        sound_note=_sound_note(event, interp),
        policy_version=event.policy_version,
        taxonomy_version=event.taxonomy_version,
        feedback=feedback,
        advice=advice,
        advice_outcome=advice_outcome,
        consumer_headline=headline,
        baseline_comparison=consumer.get("baseline_comparison"),
        baseline_note=consumer.get("baseline_note"),
        recommended_next_step=recommended_next_step,
        what_to_watch=consumer.get("what_to_watch"),
        safety=consumer.get("safety"),
        personal_memory_used=consumer.get("personal_memory_used")
        or interp.get("personal_memory_used")
        or [],
        context_bucket=interp.get("context_bucket"),
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
    _limiter: None = Depends(rate_limit("behavior.init", limit=30)),
) -> BehaviorCaptureInitResponse:
    if cached := guard.lookup():
        return BehaviorCaptureInitResponse.model_validate(cached)
    if state.engine is not None:
        lifestyle_out = await lifestyle_db.get_lifestyle(
            state.engine, user_id, payload.dog_id
        )
    else:
        lifestyle_out = lifestyle.get_lifestyle(
            state.store, user_id, payload.dog_id
        )
    resolved_bucket = resolve_context_bucket(
        payload.context_bucket, lifestyle=lifestyle_out.model_dump()
    )
    if resolved_bucket != payload.context_bucket:
        payload = payload.model_copy(update={"context_bucket": resolved_bucket})
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
        advice_outcome = await lifestyle_db.get_latest_advice_outcome(
            state.engine, user_id=user_id, event_id=event_id
        )
    else:
        event = behavior_domain.get_event(state.store, user_id=user_id, event_id=event_id)
        rec = state.store.behavior_feedback.get(event_id)
        feedback = rec.value if rec is not None and rec.user_id == user_id else None
        advice_outcome = lifestyle.get_latest_advice_outcome(
            state.store, user_id=user_id, event_id=event_id
        )
    return event_out(event, feedback, advice_outcome)


@router.post(
    "/behavior/events/{event_id}/context",
    response_model=BehaviorEventOut,
)
async def update_behavior_context(
    event_id: str,
    payload: BehaviorContextUpdateRequest,
    state: StateDep,
    user_id: UserIdDep,
    _limiter: None = Depends(rate_limit("behavior.context", limit=20)),
) -> BehaviorEventOut:
    """Save one owner answer and refine without observing the video again."""
    if state.engine is not None:
        event = await behavior_db.get_event(
            state.engine, user_id=user_id, event_id=event_id
        )
    else:
        event = behavior_domain.get_event(
            state.store, user_id=user_id, event_id=event_id
        )

    # Local import keeps the public route independent from worker startup.
    from app.worker.handlers import refine_behavior_event_context

    event = await refine_behavior_event_context(
        state,
        event=event,
        answer_id=payload.answer_id,
        legacy_context_bucket=payload.context_bucket,
    )
    return event_out(event)


@router.post("/behavior/events/{event_id}/feedback", response_model=BehaviorFeedbackResponse)
async def post_feedback(
    event_id: str,
    payload: BehaviorFeedbackRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
    _limiter: None = Depends(rate_limit("behavior.feedback", limit=60)),
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
    from app.domains.personal_engine import on_behavior_feedback

    await on_behavior_feedback(state, event_id=event_id)
    resp = BehaviorFeedbackResponse(event_id=event_id, value=rec.value)
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


async def _processing_rows(state: StateDep, *, event_id: str, user_id: str):
    if state.engine is not None:
        return await processing_context_store.list_answers_db(
            state.engine, event_id=event_id, user_id=user_id
        )
    return processing_context_store.list_answers(
        state.store, event_id=event_id, user_id=user_id
    )


async def _processing_plan_state(state: StateDep, event: BehaviorEventRec):
    from app.worker.handlers import _dog_context, _eligible_memory

    rows = await _processing_rows(
        state, event_id=event.id, user_id=event.user_id
    )
    occupied = [row.question_id for row in rows]
    capture = None
    if state.engine is not None:
        capture = await behavior_db.load_capture(
            state.engine, capture_id=event.capture_id
        )
    if capture is None:
        capture = state.store.captures.get(event.capture_id)
    has_audio = True if capture is None else bool(capture.has_audio)
    bucket = getattr(capture, "context_bucket", None) if capture is not None else None
    dog_name = "il cane"
    dog_context = None
    lifestyle = None
    memory = []
    try:
        dog, dog_context, lifestyle = await _dog_context(state, event)
        dog_name = dog.name
        memory = await _eligible_memory(state, event.dog_id)
    except (ApiError, KeyError, AttributeError, TypeError, ValueError):
        stored = state.store.dogs.get(event.dog_id)
        if stored is not None:
            dog_name = stored.name
    planned = plan_next_question(
        dog_name=dog_name,
        context_bucket=bucket,
        has_audio=has_audio,
        occupied_question_ids=occupied,
        dog_context=dog_context,
        eligible_memory=memory,
        observation=event.observation_json,
        lifestyle=lifestyle,
    )
    return rows, occupied, planned


def _question_out(planned) -> ProcessingContextQuestion | None:
    if planned is None:
        return None
    return ProcessingContextQuestion(
        id=planned.id,
        text=planned.text,
        options=[
            ProcessingContextOption(id=item.id, label=item.label)
            for item in planned.options
        ],
    )


async def _processing_out(
    state: StateDep,
    *,
    event: BehaviorEventRec,
    applied_to_interpretation: bool | None = None,
) -> ProcessingContextOut:
    rows, _occupied, planned = await _processing_plan_state(state, event)
    accepting = is_collecting_status(event.status)
    answered = sum(1 for row in rows if not row.skipped and row.answer_id)
    return ProcessingContextOut(
        event_id=event.id,
        analysis_status=str(getattr(event.status, "value", event.status)),
        question=_question_out(planned) if accepting else None,
        answered_count=answered,
        max_questions=MAX_PROCESSING_QUESTIONS,
        planner_version=PLANNER_VERSION,
        applied_to_interpretation=applied_to_interpretation,
        accepting_answers=accepting,
    )


@router.get(
    "/behavior/events/{event_id}/processing-context",
    response_model=ProcessingContextOut,
)
async def get_processing_context(
    event_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> ProcessingContextOut:
    if state.engine is not None:
        event = await behavior_db.get_event(
            state.engine, user_id=user_id, event_id=event_id
        )
    else:
        event = behavior_domain.get_event(
            state.store, user_id=user_id, event_id=event_id
        )
    return await _processing_out(state, event=event)


@router.post(
    "/behavior/events/{event_id}/processing-context",
    response_model=ProcessingContextOut,
)
async def post_processing_context(
    event_id: str,
    payload: ProcessingContextAnswerRequest,
    state: StateDep,
    user_id: UserIdDep,
    _limiter: None = Depends(rate_limit("behavior.processing_context", limit=30)),
) -> ProcessingContextOut:
    try:
        resolve_question(payload.question_id, None if payload.skipped else payload.answer_id)
    except ValueError as exc:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Unknown question or answer.") from exc
    if state.engine is not None:
        event = await behavior_db.get_event(
            state.engine, user_id=user_id, event_id=event_id
        )
    else:
        event = behavior_domain.get_event(
            state.store, user_id=user_id, event_id=event_id
        )
    rows, occupied, planned = await _processing_plan_state(state, event)
    existing = next(
        (row for row in rows if row.question_id == payload.question_id),
        None,
    )
    collecting = is_collecting_status(event.status)
    if existing is None:
        if len(occupied) >= MAX_PROCESSING_QUESTIONS:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "Processing companion already collected three answers.",
            )
        if planned is None or planned.id != payload.question_id:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "This question is not the current processing question.",
            )
        if state.engine is not None:
            await processing_context_store.upsert_answer_db(
                state.engine,
                event_id=event.id,
                user_id=user_id,
                question_id=payload.question_id,
                answer_id=payload.answer_id,
                skipped=payload.skipped,
            )
        else:
            processing_context_store.upsert_answer(
                state.store,
                event_id=event.id,
                user_id=user_id,
                question_id=payload.question_id,
                answer_id=payload.answer_id,
                skipped=payload.skipped,
            )
    # Late in-flight taps stay audited. They never re-run the Observer
    # and are not presented as applied to the first interpretation.
    return await _processing_out(
        state,
        event=event,
        applied_to_interpretation=collecting,
    )


# Keep a named export for the reasoner wiring without importing routes.
def processing_facts_payload(rows) -> list[dict]:
    return [item.model_dump(mode="json") for item in owner_facts_for_reasoner(rows)]

