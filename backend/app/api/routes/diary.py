"""GET /v1/diary — unified cursor-paginated timeline (sez. 9 / 5.1)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import StateDep, UserIdDep
from app.api.pagination import paginate
from app.contracts.api import DiaryItem, DiaryPage
from app.contracts.taxonomy import AnalysisDomain
from app.domains.models import BehaviorEventRec, FecalEventRec

router = APIRouter()


class _TimelineEntry:
    def __init__(self, rec: BehaviorEventRec | FecalEventRec, domain: AnalysisDomain, title: str, summary: str | None, status: str) -> None:
        self.id = rec.id
        self.dog_id = rec.dog_id
        self.created_at = rec.created_at
        self.domain = domain
        self.title = title
        self.summary = summary
        self.status = status


@router.get("/diary", response_model=DiaryPage)
async def get_diary(
    state: StateDep,
    user_id: UserIdDep,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    domain: Annotated[AnalysisDomain | None, Query()] = None,
    dog_id: Annotated[str | None, Query()] = None,
) -> DiaryPage:
    store = state.store
    entries: list[_TimelineEntry] = []
    if domain in (None, AnalysisDomain.BEHAVIOR):
        for e in store.behavior_events.values():
            if e.user_id != user_id or (dog_id and e.dog_id != dog_id):
                continue
            title = e.primary_intent.value if e.primary_intent else "Analisi comportamento"
            entries.append(_TimelineEntry(e, AnalysisDomain.BEHAVIOR, title, e.summary, e.status.value))
    if domain in (None, AnalysisDomain.DIGESTIVE):
        for e in store.fecal_events.values():
            if e.user_id != user_id or (dog_id and e.dog_id != dog_id):
                continue
            title = (
                f"Punteggio fecale stimato {e.fecal_score_estimate}"
                if e.fecal_score_estimate
                else "Controllo digestione"
            )
            entries.append(_TimelineEntry(e, AnalysisDomain.DIGESTIVE, title, e.summary, e.status))

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
                created_at=entry.created_at,
            )
            for entry in page
        ],
        next_cursor=next_cursor,
    )
