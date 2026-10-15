"""Giochi: submit punteggi (idempotente) e classifica settimanale."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    GameLeaderboardResponse,
    GameScoreCreate,
    GameScoreOut,
)
from app.domains import games as games_domain
from app.domains import games_db, idempotency_db
from app.domains.models import GameScoreRec

router = APIRouter()


def to_out(rec: GameScoreRec) -> GameScoreOut:
    return GameScoreOut(
        id=rec.id,
        dog_id=rec.dog_id,
        game=rec.game,
        score=rec.score,
        week_start=rec.week_start,
        created_at=rec.created_at,
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


@router.post("/games/scores", response_model=GameScoreOut, status_code=201)
async def submit_game_score(
    payload: GameScoreCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> GameScoreOut:
    if cached := guard.lookup():
        return GameScoreOut.model_validate(cached)
    if state.engine is not None:
        rec = await games_db.submit_score(
            state.engine,
            user_id=user_id,
            payload=payload,
            week_start=games_domain.current_week_start(),
        )
    else:
        rec = games_domain.submit_score_memory(
            state.store, user_id=user_id, payload=payload
        )
    response = to_out(rec)
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


@router.get("/games/leaderboard", response_model=GameLeaderboardResponse)
async def get_game_leaderboard(
    state: StateDep,
    user_id: UserIdDep,
    game: Literal["squirrel"] = Query(default="squirrel"),
) -> GameLeaderboardResponse:
    week_start = games_domain.current_week_start()
    if state.engine is not None:
        items, me = await games_db.leaderboard(
            state.engine,
            game=game,
            user_id=user_id,
            week_start=week_start,
            storage=state.storage,
        )
    else:
        items, me = games_domain.leaderboard_memory(
            state.store,
            game=game,
            user_id=user_id,
            week_start=week_start,
        )
    return GameLeaderboardResponse(game=game, week_start=week_start, items=items, me=me)
