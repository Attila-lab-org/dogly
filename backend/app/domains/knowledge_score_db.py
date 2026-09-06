"""Read-only owner-scoped Knowledge Score history."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import KnowledgeScoreOut
from app.domains import dogs_db


async def get_latest(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> KnowledgeScoreOut:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select score, components, version, calculated_at
                    from public.knowledge_scores
                    where dog_id = cast(:dog_id as uuid)
                    order by calculated_at desc, id desc
                    limit 1
                    """
                ),
                {"dog_id": dog_id},
            )
        ).mappings().first()
    if not row:
        return KnowledgeScoreOut(dog_id=dog_id)
    return KnowledgeScoreOut(
        dog_id=dog_id,
        score=float(row["score"]),
        components=dict(row["components"] or {}),
        version=str(row["version"]),
        calculated_at=row["calculated_at"],
    )
