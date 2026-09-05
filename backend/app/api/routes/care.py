"""Dog care agenda routes."""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    CareEventCreate,
    CareEventListResponse,
    CareEventOut,
    CareEventUpdate,
)
from app.domains import care as care_domain
from app.domains import care_db, idempotency_db
from app.domains.models import CareEventRec

router = APIRouter()


def to_out(event: CareEventRec) -> CareEventOut:
    return CareEventOut.model_validate(event.model_dump())


async def _record_guard(state: StateDep, guard: IdempotencyDep, body: dict) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


@router.get("/dogs/{dog_id}/care-events", response_model=CareEventListResponse)
async def list_care_events(
    dog_id: str,
    state: StateDep,
    user_id: UserIdDep,
    include_completed: bool = False,
) -> CareEventListResponse:
    if state.engine is not None:
        events = await care_db.list_care_events(
            state.engine,
            user_id=user_id,
            dog_id=dog_id,
            include_completed=include_completed,
        )
    else:
        events = care_domain.list_care_events(
            state.store,
            user_id=user_id,
            dog_id=dog_id,
            include_completed=include_completed,
        )
    return CareEventListResponse(items=[to_out(event) for event in events])


@router.post(
    "/dogs/{dog_id}/care-events",
    response_model=CareEventOut,
    status_code=201,
)
async def create_care_event(
    dog_id: str,
    payload: CareEventCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> CareEventOut:
    if cached := guard.lookup():
        return CareEventOut.model_validate(cached)
    if state.engine is not None:
        event = await care_db.create_care_event(
            state.engine,
            user_id=user_id,
            dog_id=dog_id,
            payload=payload,
        )
    else:
        event = care_domain.create_care_event(
            state.store,
            user_id=user_id,
            dog_id=dog_id,
            payload=payload,
        )
    response = to_out(event)
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


@router.patch("/care-events/{event_id}", response_model=CareEventOut)
async def update_care_event(
    event_id: str,
    payload: CareEventUpdate,
    state: StateDep,
    user_id: UserIdDep,
) -> CareEventOut:
    if state.engine is not None:
        event = await care_db.update_care_event(
            state.engine,
            user_id=user_id,
            event_id=event_id,
            payload=payload,
        )
    else:
        event = care_domain.update_care_event(
            state.store,
            user_id=user_id,
            event_id=event_id,
            payload=payload,
        )
    return to_out(event)


@router.delete("/care-events/{event_id}", status_code=204)
async def delete_care_event(
    event_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> Response:
    if state.engine is not None:
        await care_db.delete_care_event(state.engine, user_id=user_id, event_id=event_id)
    else:
        care_domain.delete_care_event(
            state.store,
            user_id=user_id,
            event_id=event_id,
        )
    return Response(status_code=204)
