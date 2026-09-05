"""GET /v1/diary — unified cursor-paginated timeline (sez. 9 / 5.1)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import StateDep, UserIdDep
from app.api.pagination import paginate_desc
from app.contracts.api import DiaryItem, DiaryPage
from app.contracts.taxonomy import (
    AnalysisDomain,
    ConfidenceBand,
    FeedbackValue,
    RetentionState,
)
from app.domains import diary_db
from app.domains.models import BehaviorEventRec, FecalEventRec

router = APIRouter()


class _TimelineEntry:
    def __init__(
        self,
        rec: BehaviorEventRec | FecalEventRec,
        domain: AnalysisDomain,
        title: str,
        summary: str | None,
        status: str,
        retention_state: RetentionState,
        confidence_band: ConfidenceBand | None = None,
        feedback: FeedbackValue | None = None,
    ) -> None:
        self.id = rec.id
        self.dog_id = rec.dog_id
        self.created_at = rec.created_at
        self.domain = domain
        self.title = title
        self.summary = summary
        self.status = status
        self.retention_state = retention_state
        self.confidence_band = confidence_band
        self.feedback = feedback


@router.get("/diary", response_model=DiaryPage)
async def get_diary(
    state: StateDep,
    user_id: UserIdDep,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    domain: Annotated[AnalysisDomain | None, Query()] = None,
    dog_id: Annotated[str | None, Query()] = None,
) -> DiaryPage:
    if state.engine is not None:
        return await diary_db.list_diary_page(
            state.engine,
            user_id=user_id,
            cursor=cursor,
            limit=limit,
            domain=domain,
            dog_id=dog_id,
        )

    store = state.store
    entries: list[_TimelineEntry] = []
    if domain in (None, AnalysisDomain.BEHAVIOR):
        for e in store.behavior_events.values():
            if e.user_id != user_id or (dog_id and e.dog_id != dog_id):
                continue
            title = e.primary_intent.value if e.primary_intent else "Analisi comportamento"
            capture = store.captures.get(e.capture_id)
            retention = (
                capture.retention_state if capture is not None else RetentionState.TEMPORARY
            )
            entries.append(
                _TimelineEntry(
                    e,
                    AnalysisDomain.BEHAVIOR,
                    title,
                    e.summary,
                    e.status.value,
                    retention,
                    e.confidence_band,
                    (
                        store.behavior_feedback[e.id].value
                        if e.id in store.behavior_feedback
                        else None
                    ),
                )
            )
    if domain in (None, AnalysisDomain.DIGESTIVE):
        for e in store.fecal_events.values():
            if e.user_id != user_id or (dog_id and e.dog_id != dog_id):
                continue
            title = (
                f"Punteggio fecale stimato {e.fecal_score_estimate}"
                if e.fecal_score_estimate
                else "Controllo digestione"
            )
            entries.append(
                _TimelineEntry(
                    e,
                    AnalysisDomain.DIGESTIVE,
                    title,
                    e.summary,
                    e.status,
                    e.retention_state,
                    e.confidence_band,
                )
            )

    page, next_cursor = paginate_desc(entries, cursor=cursor, limit=limit)
    return DiaryPage(
        items=[
            DiaryItem(
                id=entry.id,
                domain=entry.domain,
                dog_id=entry.dog_id,
                status=entry.status,
                title=entry.title,
                summary=entry.summary,
                confidence_band=entry.confidence_band,
                feedback=entry.feedback,
                retention_state=entry.retention_state,
                created_at=entry.created_at,
            )
            for entry in page
        ],
        next_cursor=next_cursor,
    )
