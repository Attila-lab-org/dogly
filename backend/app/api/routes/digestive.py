"""Digestive routes (sez. 9): fecal init/complete, event read, summary."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    DigestiveEventOut,
    DigestiveSummaryOut,
    FecalCompleteResponse,
    FecalInitRequest,
    FecalInitResponse,
)
from app.domains import digestive as digestive_domain
from app.domains import digestive_db, idempotency_db

router = APIRouter()


def _public_digestive_status(status: str) -> str:
    """Keep worker internals separate from the stable mobile status contract."""

    if status in {"OBSERVING", "INTERPRETING", "FAILED_RETRYABLE"}:
        return "PROCESSING"
    if status == "REJECTED_QUALITY":
        return "INSUFFICIENT_IMAGE"
    return status


async def _record_guard(state: StateDep, guard: IdempotencyDep, body: dict) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


@router.post("/digestive/fecal/init", response_model=FecalInitResponse)
async def init_fecal(
    payload: FecalInitRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FecalInitResponse:
    if cached := guard.lookup():
        return FecalInitResponse.model_validate(cached)
    if state.engine is not None:
        event, url, expires, reserved = await digestive_db.init_fecal_event(
            state.engine,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            payload=payload,
        )
    else:
        event, url, expires, reserved = await digestive_domain.init_fecal_event(
            state.store,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            payload=payload,
        )
    resp = FecalInitResponse(
        event_id=event.id,
        status=event.status,
        upload={"url": url, "storage_path": event.image_path, "expires_at": expires},
        quota_reserved=reserved,
    )
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


@router.post("/digestive/fecal/{event_id}/complete", response_model=FecalCompleteResponse)
async def complete_fecal(
    event_id: str,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FecalCompleteResponse:
    if cached := guard.lookup():
        return FecalCompleteResponse.model_validate(cached)
    if state.engine is not None:
        event = await digestive_db.complete_fecal_event(
            state.engine,
            storage=state.storage,
            queue=state.queue,
            user_id=user_id,
            event_id=event_id,
        )
    else:
        event = await digestive_domain.complete_fecal_event(
            state.store,
            storage=state.storage,
            queue=state.queue,
            user_id=user_id,
            event_id=event_id,
        )
    resp = FecalCompleteResponse(event_id=event.id, status=event.status)
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


@router.get("/digestive/events/{event_id}", response_model=DigestiveEventOut)
async def get_digestive_event(event_id: str, state: StateDep, user_id: UserIdDep) -> DigestiveEventOut:
    if state.engine is not None:
        e = await digestive_db.get_fecal_event(state.engine, user_id=user_id, event_id=event_id)
        active_food_name, baseline_comparison = await digestive_db.get_fecal_context(
            state.engine, user_id=user_id, event_id=event_id
        )
    else:
        e = digestive_domain.get_fecal_event(state.store, user_id=user_id, event_id=event_id)
        periods = [
            period
            for period in state.store.feeding_periods.values()
            if period.dog_id == e.dog_id
            and period.start_at <= e.created_at
            and (period.end_at is None or period.end_at >= e.created_at)
        ]
        active = max(periods, key=lambda period: period.start_at) if periods else None
        food = (
            state.store.food_products.get(active.food_product_id)
            if active is not None
            else None
        )
        active_food_name = food.name if food is not None else None
        baseline_comparison = None
    observation = e.observation_json or {}
    return DigestiveEventOut(
        id=e.id,
        dog_id=e.dog_id,
        status=_public_digestive_status(e.status),
        fecal_score_estimate=e.fecal_score_estimate,
        consistency=e.consistency,
        color=e.color,
        image_quality=observation.get("image_quality", "unknown"),
        quality_warnings=observation.get("warnings", []),
        mucus_candidate=observation.get("mucus_candidate", "unknown"),
        fresh_blood_candidate=observation.get("fresh_blood_candidate", "unknown"),
        melena_candidate=observation.get("melena_candidate", "unknown"),
        foreign_material_candidate=observation.get(
            "foreign_material_candidate", "unknown"
        ),
        confidence_band=e.confidence_band,
        safety_flags=e.safety_flags,
        summary=e.summary,
        active_food_name=active_food_name,
        baseline_comparison=baseline_comparison,
        created_at=e.created_at,
    )


@router.get("/dogs/{dog_id}/digestive-summary", response_model=DigestiveSummaryOut)
async def get_digestive_summary(dog_id: str, state: StateDep, user_id: UserIdDep) -> DigestiveSummaryOut:
    if state.engine is not None:
        summary = await digestive_db.digestive_summary(state.engine, user_id=user_id, dog_id=dog_id)
    else:
        summary = digestive_domain.digestive_summary(state.store, user_id=user_id, dog_id=dog_id)
    return DigestiveSummaryOut(**summary)
