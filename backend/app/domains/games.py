"""Giochi: punteggi settimanali (in-memory store per mock gate/test)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from app.contracts.api import GameScoreCreate, LeaderboardEntryOut
from app.domains.models import GameScoreRec
from app.domains.repository import InMemoryStore


def current_week_start(today: date | None = None) -> date:
    """Lunedì della settimana corrente: la classifica si azzera il lunedì."""
    day = today or datetime.now(UTC).date()
    return day - timedelta(days=day.weekday())


def submit_score_memory(
    store: InMemoryStore,
    *,
    user_id: str,
    payload: GameScoreCreate,
) -> GameScoreRec:
    for existing in store.game_scores.values():
        if (
            existing.user_id == user_id
            and existing.game == payload.game
            and existing.client_request_id == payload.client_request_id
        ):
            return existing
    rec = GameScoreRec(
        id=f"gs-{uuid.uuid4().hex[:12]}",
        user_id=user_id,
        dog_id=payload.dog_id,
        game=payload.game,
        score=payload.score,
        week_start=current_week_start(),
        client_request_id=payload.client_request_id,
        created_at=datetime.now(UTC),
    )
    store.game_scores[rec.id] = rec
    return rec


def leaderboard_memory(
    store: InMemoryStore,
    *,
    game: str,
    user_id: str,
    week_start: date,
) -> tuple[list[LeaderboardEntryOut], LeaderboardEntryOut | None]:
    best: dict[str, GameScoreRec] = {}
    for rec in store.game_scores.values():
        if rec.game != game or rec.week_start != week_start:
            continue
        current = best.get(rec.dog_id)
        if current is None or rec.score > current.score:
            best[rec.dog_id] = rec
    ordered = sorted(
        best.values(), key=lambda rec: (-rec.score, rec.created_at, rec.dog_id)
    )
    my_dog_ids = {
        dog.id for dog in store.dogs.values() if dog.owner_id == user_id
    }

    def to_entry(rank: int, rec: GameScoreRec) -> LeaderboardEntryOut:
        dog = store.dogs.get(rec.dog_id)
        return LeaderboardEntryOut(
            rank=rank,
            dog_id=rec.dog_id,
            dog_name=dog.name if dog else "Un cane",
            score=rec.score,
            avatar_url=None,
            is_mine=rec.dog_id in my_dog_ids,
        )

    items = [to_entry(rank + 1, rec) for rank, rec in enumerate(ordered[:20])]
    me = None
    for rank, rec in enumerate(ordered):
        if rec.dog_id in my_dog_ids:
            me = to_entry(rank + 1, rec)
            break
    return items, me
