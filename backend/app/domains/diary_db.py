"""PostgreSQL repository for the unified diary timeline.

FIX 2.3: cursor pagination is pushed into SQL (``(created_at, id) < cursor``)
instead of loading the full timeline and slicing in Python. Each branch
(behavior / digestive) is filtered and ordered in SQL, then merged via
UNION ALL and limited once. The response shape is unchanged.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.api.pagination import decode_cursor, encode_cursor
from app.contracts.api import DiaryItem, DiaryPage
from app.contracts.taxonomy import (
    AnalysisDomain,
    ConfidenceBand,
    FeedbackValue,
    RetentionState,
)


class _TimelineEntry:
    def __init__(self, row: Mapping[str, Any]) -> None:
        self.id = str(row["id"])
        self.dog_id = str(row["dog_id"])
        self.created_at = row["created_at"]
        self.domain = AnalysisDomain(str(row["domain"]))
        self.title = str(row["title"])
        self.summary = row["summary"]
        self.status = str(row["status"])
        self.confidence_band = (
            ConfidenceBand(str(row["confidence_band"]))
            if row.get("confidence_band")
            else None
        )
        self.feedback = (
            FeedbackValue(str(row["feedback"])) if row.get("feedback") else None
        )
        raw_retention = row.get("retention_state") or RetentionState.TEMPORARY.value
        self.retention_state = RetentionState(str(raw_retention))


async def list_diary_page(
    engine: AsyncEngine,
    *,
    user_id: str,
    cursor: str | None,
    limit: int,
    domain: AnalysisDomain | None,
    dog_id: str | None,
    q: str | None = None,
) -> DiaryPage:
    params: dict[str, Any] = {
        "user_id": user_id,
        "limit": limit + 1,  # fetch one extra to detect a next page
    }
    dog_filter = ""
    domain_filter = ""
    search_filter = ""
    if dog_id:
        dog_filter = "and dog_id = cast(:dog_id as uuid)"
        params["dog_id"] = dog_id
    if domain is not None:
        domain_filter = "and domain = :domain"
        params["domain"] = domain.value
    if q and q.strip():
        search_filter = "and (title ilike :q or coalesce(summary, '') ilike :q)"
        params["q"] = f"%{q.strip()}%"

    cursor_filter = ""
    if cursor:
        ts, last_id = decode_cursor(cursor)
        params["cursor_ts"] = ts
        params["cursor_id"] = last_id
        cursor_filter = (
            "and (created_at, id) < (:cursor_ts, cast(:cursor_id as uuid))"
        )

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    f"""
                    select *
                    from (
                      select e.id,
                             e.dog_id,
                             e.created_at,
                             'BEHAVIOR'::text as domain,
                             coalesce(e.primary_intent::text, 'Analisi comportamento') as title,
                             e.summary,
                             e.status::text as status,
                             coalesce(c.retention_state::text, 'TEMPORARY') as retention_state,
                             e.confidence_band::text as confidence_band,
                             bf.value::text as feedback
                      from public.behavior_events e
                      left join public.behavior_captures c on c.id = e.capture_id
                      left join public.behavior_feedback bf on bf.event_id = e.id
                      where e.user_id = cast(:user_id as uuid)
                      union all
                      select f.id,
                             f.dog_id,
                             f.created_at,
                             'DIGESTIVE'::text as domain,
                             'Controllo digestione' as title,
                             f.summary,
                             case
                               when f.status in ('OBSERVING', 'INTERPRETING', 'QUEUED')
                                 then 'PROCESSING'
                               when f.status = 'REJECTED_QUALITY'
                                 then 'INSUFFICIENT_IMAGE'
                               else f.status::text
                             end as status,
                             coalesce(f.retention_state::text, 'TEMPORARY') as retention_state,
                             f.confidence_band::text as confidence_band,
                             null::text as feedback
                      from public.fecal_events f
                      where f.user_id = cast(:user_id as uuid)
                    ) timeline
                    where true
                      {dog_filter}
                      {domain_filter}
                      {search_filter}
                      {cursor_filter}
                    order by created_at desc, id desc
                    limit :limit
                    """
                ),
                params,
            )
        ).mappings().all()

    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = None
    if has_more and page_rows:
        next_cursor = encode_cursor(_TimelineEntry(page_rows[-1]))

    return DiaryPage(
        items=[
            DiaryItem(
                id=str(row["id"]),
                domain=AnalysisDomain(str(row["domain"])),
                dog_id=str(row["dog_id"]),
                status=str(row["status"]),
                title=str(row["title"]),
                summary=row["summary"],
                confidence_band=(
                    ConfidenceBand(str(row["confidence_band"]))
                    if row.get("confidence_band")
                    else None
                ),
                feedback=(
                    FeedbackValue(str(row["feedback"]))
                    if row.get("feedback")
                    else None
                ),
                retention_state=RetentionState(
                    str(row.get("retention_state") or RetentionState.TEMPORARY.value)
                ),
                created_at=row["created_at"],
            )
            for row in page_rows
        ],
        next_cursor=next_cursor,
    )
