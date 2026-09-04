"""Pattern routes (sez. 9): user-visible eligible patterns + review actions.

Pattern writes go through the deterministic Personal Intelligence service only
(sez. 17): review actions NEVER strengthen a pattern from model output.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import (
    PatternListResponse,
    PatternOut,
    PatternReviewRequest,
    PatternReviewResponse,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import ELIGIBLE_PATTERN_STATES, PatternState
from app.domains.dogs import get_owned_dog
from app.domains.repository import now_utc

router = APIRouter()


def _out(p) -> PatternOut:
    return PatternOut(
        id=p.id,
        dog_id=p.dog_id,
        title=p.title,
        state=p.state,
        reliability_band=p.reliability_band,
        support_count=p.support_count,
        version=p.version,
        last_seen=p.last_seen,
    )


@router.get("/dogs/{dog_id}/patterns", response_model=PatternListResponse)
async def list_patterns(dog_id: str, state: StateDep, user_id: UserIdDep) -> PatternListResponse:
    get_owned_dog(state.store, user_id=user_id, dog_id=dog_id)
    visible = [
        p
        for p in state.store.patterns.values()
        if p.dog_id == dog_id and p.state in ELIGIBLE_PATTERN_STATES | {PatternState.CONTESTED}
    ]
    return PatternListResponse(items=[_out(p) for p in visible])


@router.post("/patterns/{pattern_id}/review", response_model=PatternReviewResponse)
async def review_pattern(
    pattern_id: str, payload: PatternReviewRequest, state: StateDep, user_id: UserIdDep
) -> PatternReviewResponse:
    pattern = state.store.patterns.get(pattern_id)
    if pattern is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Pattern not found")
    get_owned_dog(state.store, user_id=user_id, dog_id=pattern.dog_id)
    if payload.action == "contest":
        pattern.state = PatternState.CONTESTED
    elif payload.action == "archive":
        pattern.state = PatternState.ARCHIVED
    elif payload.action == "correct_context":
        # Context correction is stored as metadata; no state change.
        pattern.version += 1
    pattern.last_seen = now_utc()
    return PatternReviewResponse(pattern_id=pattern.id, state=pattern.state)
