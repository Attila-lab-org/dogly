"""PostgreSQL repository per i punteggi dei giochi (game_scores)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import GameScoreCreate, LeaderboardEntryOut
from app.domains.models import GameScoreRec
from app.providers.base import StorageProvider


async def submit_score(
    engine: AsyncEngine,
    *,
    user_id: str,
    payload: GameScoreCreate,
    week_start: date,
) -> GameScoreRec:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.game_scores
                      (user_id, dog_id, game, score, week_start, client_request_id)
                    values
                      (cast(:user_id as uuid), cast(:dog_id as uuid), :game,
                       :score, :week_start, :client_request_id)
                    on conflict (user_id, game, client_request_id)
                    do update set score = game_scores.score
                    returning id, dog_id, game, score, week_start, created_at
                    """
                ),
                {
                    "user_id": user_id,
                    "dog_id": payload.dog_id,
                    "game": payload.game,
                    "score": payload.score,
                    "week_start": week_start,
                    "client_request_id": payload.client_request_id,
                },
            )
        ).mappings().one()
    return GameScoreRec(
        id=str(row["id"]),
        user_id=user_id,
        dog_id=str(row["dog_id"]),
        game=str(row["game"]),
        score=int(row["score"]),
        week_start=row["week_start"],
        client_request_id=payload.client_request_id,
        created_at=row["created_at"],
    )


async def leaderboard(
    engine: AsyncEngine,
    *,
    game: str,
    user_id: str,
    week_start: date,
    storage: StorageProvider | None = None,
) -> tuple[list[LeaderboardEntryOut], LeaderboardEntryOut | None]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select d.id as dog_id,
                           d.name as dog_name,
                           d.owner_id as owner_id,
                           d.photo_path as photo_path,
                           dpv.visibility as visibility,
                           max(gs.score) as best_score,
                           min(gs.created_at) as first_at
                    from public.game_scores gs
                    join public.dogs d on d.id = gs.dog_id
                    left join public.dog_profile_visibility dpv on dpv.dog_id = d.id
                    where gs.game = :game and gs.week_start = :week_start
                    group by d.id, d.name, d.owner_id, d.photo_path, dpv.visibility
                    order by best_score desc, first_at asc, d.id
                    """
                ),
                {"game": game, "week_start": week_start},
            )
        ).mappings().all()

    # Avatar solo per profili cane esplicitamente PUBLIC (mai il bucket
    # privato dog-avatars senza opt-in).
    public_paths = [
        str(row["photo_path"])
        for row in rows
        if row.get("photo_path") and str(row.get("visibility") or "") == "PUBLIC"
    ]
    signed: dict[str, str] = {}
    if storage and public_paths:
        signed = await storage.create_signed_read_urls(
            bucket="dog-avatars",
            paths=public_paths,
            ttl_seconds=600,
        )

    def to_entry(rank: int, row) -> LeaderboardEntryOut:
        photo_path = row.get("photo_path")
        avatar_url = (
            signed.get(str(photo_path))
            if photo_path and str(row.get("visibility") or "") == "PUBLIC"
            else None
        )
        return LeaderboardEntryOut(
            rank=rank,
            dog_id=str(row["dog_id"]),
            dog_name=str(row["dog_name"]),
            score=int(row["best_score"]),
            avatar_url=avatar_url,
            is_mine=str(row["owner_id"]) == user_id,
        )

    entries = [to_entry(rank + 1, row) for rank, row in enumerate(rows)]
    items = entries[:20]
    mine = next((entry for entry in entries if entry.is_mine), None)
    return items, mine
