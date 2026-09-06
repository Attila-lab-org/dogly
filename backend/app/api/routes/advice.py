"""Progressive lifestyle context and personal advice outcome APIs."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    AdviceOutcomeCreate,
    AdviceOutcomeOut,
    DogLifestyleOut,
    DogLifestylePatch,
    KnowledgeScoreOut,
)
from app.domains import dogs as dogs_domain
from app.domains import idempotency_db, knowledge_score_db, lifestyle_db
from app.domains import lifestyle as lifestyle_domain

router = APIRouter()


async def _record_guard(
    state: StateDep, guard: IdempotencyDep, body: dict
) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


@router.get("/dogs/{dog_id}/knowledge-score", response_model=KnowledgeScoreOut)
async def get_knowledge_score(
    dog_id: str, state: StateDep, user_id: UserIdDep
) -> KnowledgeScoreOut:
    if state.engine is not None:
        return await knowledge_score_db.get_latest(
            state.engine, user_id=user_id, dog_id=dog_id
        )
    dogs_domain.get_owned_dog(state.store, user_id=user_id, dog_id=dog_id)
    return KnowledgeScoreOut(dog_id=dog_id)


@router.get("/dogs/{dog_id}/lifestyle", response_model=DogLifestyleOut)
async def get_lifestyle(
    dog_id: str, state: StateDep, user_id: UserIdDep
) -> DogLifestyleOut:
    if state.engine is not None:
        return await lifestyle_db.get_lifestyle(state.engine, user_id, dog_id)
    return lifestyle_domain.get_lifestyle(state.store, user_id, dog_id)


@router.patch("/dogs/{dog_id}/lifestyle", response_model=DogLifestyleOut)
async def patch_lifestyle(
    dog_id: str,
    payload: DogLifestylePatch,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> DogLifestyleOut:
    if cached := guard.lookup():
        return DogLifestyleOut.model_validate(cached)
    if state.engine is not None:
        result = await lifestyle_db.patch_lifestyle(
            state.engine, user_id, dog_id, payload
        )
    else:
        result = lifestyle_domain.patch_lifestyle(
            state.store, user_id, dog_id, payload
        )
    await _record_guard(state, guard, result.model_dump(mode="json"))
    return result


@router.post(
    "/behavior/events/{event_id}/advice-outcome",
    response_model=AdviceOutcomeOut,
    status_code=201,
)
async def post_advice_outcome(
    event_id: str,
    payload: AdviceOutcomeCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> AdviceOutcomeOut:
    if cached := guard.lookup():
        return AdviceOutcomeOut.model_validate(cached)
    if state.engine is not None:
        outcome = await lifestyle_db.record_advice_outcome(
            state.engine, user_id, event_id, payload
        )
    else:
        outcome = lifestyle_domain.record_advice_outcome(
            state.store, user_id, event_id, payload
        )
    await _record_guard(state, guard, outcome.model_dump(mode="json"))
    return outcome
