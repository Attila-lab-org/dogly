"""Dogly Signals routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    SignalExperimentCreate,
    SignalExperimentListResponse,
    SignalExperimentOut,
    SignalMapEntryOut,
    SignalMapResponse,
)
from app.domains import signals as signals_domain
from app.domains import signals_db
from app.domains.models import SignalExperimentRec, SignalMapEntryRec

router = APIRouter()


def experiment_out(experiment: SignalExperimentRec) -> SignalExperimentOut:
    return SignalExperimentOut.model_validate(experiment.model_dump())


def map_out(entry: SignalMapEntryRec) -> SignalMapEntryOut:
    return SignalMapEntryOut.model_validate(entry.model_dump())


@router.get("/dogs/{dog_id}/signals", response_model=SignalMapResponse)
async def get_signal_map(
    dog_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> SignalMapResponse:
    if state.engine:
        entries = await signals_db.list_signal_map(
            state.engine, user_id=user_id, dog_id=dog_id
        )
    else:
        entries = signals_domain.list_signal_map(
            state.store, user_id=user_id, dog_id=dog_id
        )
    return SignalMapResponse(
        items=[map_out(entry) for entry in entries],
        next_category=signals_domain.next_signal_category(entries),
    )


@router.get("/dogs/{dog_id}/signals/experiments", response_model=SignalExperimentListResponse)
async def list_signal_experiments(
    dog_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> SignalExperimentListResponse:
    if state.engine:
        experiments = await signals_db.list_signal_experiments(
            state.engine, user_id=user_id, dog_id=dog_id
        )
    else:
        experiments = signals_domain.list_signal_experiments(
            state.store, user_id=user_id, dog_id=dog_id
        )
    return SignalExperimentListResponse(items=[experiment_out(item) for item in experiments])


@router.post(
    "/dogs/{dog_id}/signals/experiments",
    response_model=SignalExperimentOut,
    status_code=201,
)
async def create_signal_experiment(
    dog_id: str,
    payload: SignalExperimentCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> SignalExperimentOut:
    if cached := guard.lookup():
        return SignalExperimentOut.model_validate(cached)
    if state.engine:
        experiment = await signals_db.create_signal_experiment(
            state.engine, user_id=user_id, dog_id=dog_id, payload=payload
        )
    else:
        experiment = signals_domain.create_signal_experiment(
            state.store, user_id=user_id, dog_id=dog_id, payload=payload
        )
    response = experiment_out(experiment)
    guard.record(response.model_dump(mode="json"))
    return response
