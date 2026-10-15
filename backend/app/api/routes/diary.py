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


def _public_digestive_diary_status(status: str) -> str:
    if status in {"OBSERVING", "INTERPRETING", "QUEUED"}:
        return "PROCESSING"
    if status == "REJECTED_QUALITY":
        return "INSUFFICIENT_IMAGE"
    return status


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
        media_path: str | None = None,
        media_kind: str | None = None,
        digestive_score: int | None = None,
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
        self.media_path = media_path
        self.media_kind = media_kind
        self.digestive_score = digestive_score


@router.get("/diary", response_model=DiaryPage)
async def get_diary(
    state: StateDep,
    user_id: UserIdDep,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    domain: Annotated[AnalysisDomain | None, Query()] = None,
    dog_id: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
    status: Annotated[str | None, Query(max_length=40)] = None,
) -> DiaryPage:
    if state.engine is not None:
        return await diary_db.list_diary_page(
            state.engine,
            user_id=user_id,
            cursor=cursor,
            limit=limit,
            domain=domain,
            dog_id=dog_id,
            q=q,
            status=status,
            storage=state.storage,
        )

    store = state.store
    entries: list[_TimelineEntry] = []
    if domain in (None, AnalysisDomain.BEHAVIOR):
        for e in store.behavior_events.values():
            if e.user_id != user_id or (dog_id and e.dog_id != dog_id):
                continue
            interpretation = e.interpretation_json or {}
            consumer = interpretation.get("consumer") or {}
            title = (
                interpretation.get("consumer_headline")
                or consumer.get("consumer_headline")
                or "Momento da osservare"
            )
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
                    media_path=(
                        capture.storage_path
                        if capture is not None
                        and capture.storage_path
                        and retention != RetentionState.DELETED
                        else None
                    ),
                    media_kind="VIDEO",
                )
            )
    if domain in (None, AnalysisDomain.DIGESTIVE):
        for e in store.fecal_events.values():
            if e.user_id != user_id or (dog_id and e.dog_id != dog_id):
                continue
            intelligence = e.intelligence_json or {}
            title = (
                intelligence.get("consumer_headline")
                or "Osservazione digestiva"
            )
            entries.append(
                _TimelineEntry(
                    e,
                    AnalysisDomain.DIGESTIVE,
                    title,
                    e.summary,
                    _public_digestive_diary_status(e.status),
                    e.retention_state,
                    e.confidence_band,
                    media_path=(
                        e.image_path
                        if e.image_path and e.retention_state != RetentionState.DELETED
                        else None
                    ),
                    media_kind="PHOTO",
                    digestive_score=e.fecal_score_estimate,
                )
            )

    term = (q or "").strip().lower()
    if term:
        entries = [
            entry
            for entry in entries
            if term in f"{entry.title} {entry.summary or ''}".lower()
        ]
    if status:
        entries = [entry for entry in entries if entry.status == status]

    page, next_cursor = paginate_desc(entries, cursor=cursor, limit=limit)
    signed: dict[tuple[str, str], str] = {}
    for kind, bucket in (("VIDEO", "behavior-raw"), ("PHOTO", "digestive-raw")):
        paths = [
            entry.media_path
            for entry in page
            if entry.media_kind == kind and entry.media_path
        ]
        if paths:
            urls = await state.storage.create_signed_read_urls(
                bucket=bucket,
                paths=paths,
                ttl_seconds=600,
            )
            signed.update({(kind, path): url for path, url in urls.items()})
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
                media_url=(
                    signed.get((entry.media_kind, entry.media_path))
                    if entry.media_kind and entry.media_path
                    else None
                ),
                media_kind=entry.media_kind,
                digestive_score=entry.digestive_score,
                created_at=entry.created_at,
            )
            for entry in page
        ],
        next_cursor=next_cursor,
    )
