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

router = APIRouter()


@router.post("/digestive/fecal/init", response_model=FecalInitResponse)
async def init_fecal(
    payload: FecalInitRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FecalInitResponse:
    if cached := guard.lookup():
        return FecalInitResponse.model_validate(cached)
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
    guard.record(resp.model_dump(mode="json"))
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
    event = await digestive_domain.complete_fecal_event(
        state.store,
        storage=state.storage,
        queue=state.queue,
        user_id=user_id,
        event_id=event_id,
    )
    resp = FecalCompleteResponse(event_id=event.id, status=event.status)
    guard.record(resp.model_dump(mode="json"))
    return resp


@router.get("/digestive/events/{event_id}", response_model=DigestiveEventOut)
async def get_digestive_event(event_id: str, state: StateDep, user_id: UserIdDep) -> DigestiveEventOut:
    e = digestive_domain.get_fecal_event(state.store, user_id=user_id, event_id=event_id)
    return DigestiveEventOut(
        id=e.id,
        dog_id=e.dog_id,
        status=e.status,
        fecal_score_estimate=e.fecal_score_estimate,
        consistency=e.consistency,
        color=e.color,
        confidence_band=e.confidence_band,
        safety_flags=e.safety_flags,
        summary=e.summary,
        created_at=e.created_at,
    )


@router.get("/dogs/{dog_id}/digestive-summary", response_model=DigestiveSummaryOut)
async def get_digestive_summary(dog_id: str, state: StateDep, user_id: UserIdDep) -> DigestiveSummaryOut:
    return DigestiveSummaryOut(**digestive_domain.digestive_summary(state.store, user_id=user_id, dog_id=dog_id))
