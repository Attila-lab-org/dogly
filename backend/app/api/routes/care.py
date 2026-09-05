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
from app.domains.models import CareEventRec

router = APIRouter()


def to_out(event: CareEventRec) -> CareEventOut:
    return CareEventOut.model_validate(event.model_dump())


@router.get("/dogs/{dog_id}/care-events", response_model=CareEventListResponse)
async def list_care_events(
    dog_id: str,
    state: StateDep,
    user_id: UserIdDep,
    include_completed: bool = False,
) -> CareEventListResponse:
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
    event = care_domain.create_care_event(
        state.store,
        user_id=user_id,
        dog_id=dog_id,
        payload=payload,
    )
    response = to_out(event)
    guard.record(response.model_dump(mode="json"))
    return response


@router.patch("/care-events/{event_id}", response_model=CareEventOut)
async def update_care_event(
    event_id: str,
    payload: CareEventUpdate,
    state: StateDep,
    user_id: UserIdDep,
) -> CareEventOut:
    return to_out(
        care_domain.update_care_event(
            state.store,
            user_id=user_id,
            event_id=event_id,
            payload=payload,
        )
    )


@router.delete("/care-events/{event_id}", status_code=204)
async def delete_care_event(
    event_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> Response:
    care_domain.delete_care_event(
        state.store,
        user_id=user_id,
        event_id=event_id,
    )
    return Response(status_code=204)
