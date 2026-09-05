"""PostgreSQL repository for the unified diary timeline."""

from __future__ import annotations

from typing import Any, Mapping

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.api.pagination import paginate
from app.contracts.api import DiaryItem, DiaryPage
from app.contracts.taxonomy import AnalysisDomain


class _TimelineEntry:
    def __init__(self, row: Mapping[str, Any]) -> None:
        self.id = str(row["id"])
        self.dog_id = str(row["dog_id"])
        self.created_at = row["created_at"]
        self.domain = AnalysisDomain(str(row["domain"]))
        self.title = str(row["title"])
        self.summary = row["summary"]
        self.status = str(row["status"])
        self.retention_state = str(row["retention_state"])


async def list_diary_page(
    engine: AsyncEngine,
    *,
    user_id: str,
    cursor: str | None,
    limit: int,
    domain: AnalysisDomain | None,
    dog_id: str | None,
) -> DiaryPage:
    domain_value = domain.value if domain else None
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select *
                    from (
                      select e.id,
                             e.dog_id,
                             e.created_at,
                             'BEHAVIOR'::text as domain,
                             coalesce(e.primary_intent, 'Analisi comportamento') as title,
                             e.summary,
                             e.status,
                             c.retention_state
                      from public.behavior_events e
                      join public.behavior_captures c on c.id = e.capture_id
                      where e.user_id = :user_id
                        and (:dog_id is null or e.dog_id = cast(:dog_id as uuid))
                      union all
                      select f.id,
                             f.dog_id,
                             f.created_at,
                             'DIGESTIVE'::text as domain,
                             case
                               when f.fecal_score_estimate is not null
                               then 'Punteggio fecale stimato ' || f.fecal_score_estimate::text
                               else 'Controllo digestione'
                             end as title,
                             f.summary,
                             f.status,
                             f.retention_state
                      from public.fecal_events f
                      where f.user_id = :user_id
                        and (:dog_id is null or f.dog_id = cast(:dog_id as uuid))
                    ) timeline
                    where (:domain is null or domain = :domain)
                    order by created_at asc, id asc
                    """
                ),
                {"user_id": user_id, "dog_id": dog_id, "domain": domain_value},
            )
        ).mappings().all()

    entries = [_TimelineEntry(row) for row in rows]
    page, next_cursor = paginate(entries, cursor=cursor, limit=limit)
    return DiaryPage(
        items=[
            DiaryItem(
                id=entry.id,
                domain=entry.domain,
                dog_id=entry.dog_id,
                status=entry.status,
                title=entry.title,
                summary=entry.summary,
                retention_state=entry.retention_state,
                created_at=entry.created_at,
            )
            for entry in page
        ],
        next_cursor=next_cursor,
    )
