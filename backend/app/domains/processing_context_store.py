"""Event-scoped processing context answers. Memory store + Postgres."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.taxonomy import BEHAVIOR_EVENT_TRANSITIONS, BehaviorEventStatus
from app.domains.models import BehaviorEventRec, ProcessingContextAnswerRec
from app.domains.processing_context import (
    QUESTION_BANK_VERSION,
    answer_is_in_snapshot,
    is_collecting_status,
    merge_closed_snapshot,
    owner_facts_for_reasoner,
    snapshot_from_event,
)
from app.domains.repository import InMemoryStore, new_id, now_utc


def answer_from_row(row: Any) -> ProcessingContextAnswerRec:
    data = dict(row)
    for key in ("id", "event_id", "user_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return ProcessingContextAnswerRec.model_validate(data)


def list_answers(
    store: InMemoryStore, *, event_id: str, user_id: str
) -> list[ProcessingContextAnswerRec]:
    return [
        row
        for row in store.processing_context_answers.values()
        if row.event_id == event_id and row.user_id == user_id
    ]


def upsert_answer(
    store: InMemoryStore,
    *,
    event_id: str,
    user_id: str,
    question_id: str,
    answer_id: str | None,
    skipped: bool,
) -> ProcessingContextAnswerRec:
    existing = next(
        (
            row
            for row in list_answers(store, event_id=event_id, user_id=user_id)
            if row.question_id == question_id
        ),
        None,
    )
    if existing is not None:
        return existing
    now = now_utc()
    rec = ProcessingContextAnswerRec(
        id=new_id(),
        event_id=event_id,
        user_id=user_id,
        question_id=question_id,
        answer_id=None if skipped else answer_id,
        skipped=skipped,
        question_version=QUESTION_BANK_VERSION,
        answered_at=now,
        created_at=now,
    )
    store.processing_context_answers[rec.id] = rec
    return rec


def _event_status(value: Any) -> BehaviorEventStatus:
    if isinstance(value, BehaviorEventStatus):
        return value
    return BehaviorEventStatus(str(value))


def _maybe_set_status(event: BehaviorEventRec, next_status: BehaviorEventStatus | None) -> None:
    if next_status is None or event.status == next_status:
        return
    allowed = BEHAVIOR_EVENT_TRANSITIONS.get(event.status, frozenset())
    if next_status in allowed:
        event.status = next_status


def _applied_for_question(event: BehaviorEventRec, question_id: str) -> bool:
    snapshot = snapshot_from_event(event)
    if snapshot is not None:
        return answer_is_in_snapshot(snapshot, question_id)
    return is_collecting_status(event.status)


def _snapshot_rows(rows: list[ProcessingContextAnswerRec]) -> list[dict[str, Any]]:
    return [item.model_dump(mode="json") for item in owner_facts_for_reasoner(rows)]


def _close_locked(
    store: InMemoryStore,
    event: BehaviorEventRec,
    *,
    next_status: BehaviorEventStatus | None,
) -> list[dict[str, Any]]:
    live = store.behavior_events.get(event.id, event)
    existing = snapshot_from_event(live)
    if existing is not None:
        _maybe_set_status(live, next_status)
        event.status = live.status
        event.interpretation_json = live.interpretation_json
        return existing
    snapshot = _snapshot_rows(list_answers(store, event_id=live.id, user_id=live.user_id))
    _maybe_set_status(live, next_status)
    live.interpretation_json = merge_closed_snapshot(live.interpretation_json, snapshot)
    event.status = live.status
    event.interpretation_json = live.interpretation_json
    store.behavior_events[live.id] = live
    return snapshot


async def upsert_answer_atomic(
    store: InMemoryStore,
    event: BehaviorEventRec,
    *,
    question_id: str,
    answer_id: str | None,
    skipped: bool,
) -> tuple[ProcessingContextAnswerRec, bool]:
    async with store.lock:
        live = store.behavior_events.get(event.id, event)
        rec = upsert_answer(
            store,
            event_id=live.id,
            user_id=live.user_id,
            question_id=question_id,
            answer_id=answer_id,
            skipped=skipped,
        )
        applied = _applied_for_question(live, question_id)
        event.status = live.status
        event.interpretation_json = live.interpretation_json
        return rec, applied


async def close_collection(
    store: InMemoryStore,
    event: BehaviorEventRec,
    *,
    next_status: BehaviorEventStatus | None = BehaviorEventStatus.INTERPRETING,
) -> list[dict[str, Any]]:
    async with store.lock:
        return _close_locked(store, event, next_status=next_status)


async def list_answers_db(
    engine: AsyncEngine, *, event_id: str, user_id: str
) -> list[ProcessingContextAnswerRec]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select id, event_id, user_id, question_id, answer_id, skipped,
                           question_version, source, answered_at, created_at
                    from public.behavior_processing_context_answers
                    where event_id = :event_id and user_id = :user_id
                    order by created_at
                    """
                ),
                {"event_id": event_id, "user_id": user_id},
            )
        ).mappings()
    return [answer_from_row(row) for row in rows]


def _insert_answer_sql() -> str:
    return """
        insert into public.behavior_processing_context_answers (
          id, event_id, user_id, question_id, answer_id, skipped,
          question_version, source, answered_at, created_at
        ) values (
          :id, :event_id, :user_id, :question_id, :answer_id, :skipped,
          :question_version, :source, :answered_at, :created_at
        )
        on conflict (event_id, question_id, user_id)
        do update set question_id = public.behavior_processing_context_answers.question_id
        returning id, event_id, user_id, question_id, answer_id, skipped,
                  question_version, source, answered_at, created_at
    """


async def upsert_answer_db(
    engine: AsyncEngine,
    *,
    event_id: str,
    user_id: str,
    question_id: str,
    answer_id: str | None,
    skipped: bool,
) -> ProcessingContextAnswerRec:
    rec = ProcessingContextAnswerRec(
        id=new_id(),
        event_id=event_id,
        user_id=user_id,
        question_id=question_id,
        answer_id=None if skipped else answer_id,
        skipped=skipped,
        question_version=QUESTION_BANK_VERSION,
        answered_at=now_utc(),
        created_at=now_utc(),
    )
    async with engine.begin() as conn:
        row = (
            await conn.execute(text(_insert_answer_sql()), rec.model_dump())
        ).mappings().one()
    return answer_from_row(row)


async def upsert_answer_atomic_db(
    engine: AsyncEngine,
    event: BehaviorEventRec,
    *,
    question_id: str,
    answer_id: str | None,
    skipped: bool,
) -> tuple[ProcessingContextAnswerRec, bool]:
    rec = ProcessingContextAnswerRec(
        id=new_id(),
        event_id=event.id,
        user_id=event.user_id,
        question_id=question_id,
        answer_id=None if skipped else answer_id,
        skipped=skipped,
        question_version=QUESTION_BANK_VERSION,
        answered_at=now_utc(),
        created_at=now_utc(),
    )
    async with engine.begin() as conn:
        locked = (
            await conn.execute(
                text(
                    """
                    select status, interpretation_json
                    from public.behavior_events
                    where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
                    for update
                    """
                ),
                {"id": event.id, "user_id": event.user_id},
            )
        ).mappings().first()
        if locked is None:
            raise KeyError(event.id)
        event.status = _event_status(locked["status"])
        event.interpretation_json = locked["interpretation_json"] or {}
        row = (
            await conn.execute(text(_insert_answer_sql()), rec.model_dump())
        ).mappings().one()
        applied = _applied_for_question(event, question_id)
    return answer_from_row(row), applied


async def close_collection_db(
    engine: AsyncEngine,
    event: BehaviorEventRec,
    *,
    next_status: BehaviorEventStatus | None = BehaviorEventStatus.INTERPRETING,
) -> list[dict[str, Any]]:
    async with engine.begin() as conn:
        locked = (
            await conn.execute(
                text(
                    """
                    select status, interpretation_json
                    from public.behavior_events
                    where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
                    for update
                    """
                ),
                {"id": event.id, "user_id": event.user_id},
            )
        ).mappings().first()
        if locked is None:
            raise KeyError(event.id)
        event.status = _event_status(locked["status"])
        event.interpretation_json = locked["interpretation_json"] or {}
        existing = snapshot_from_event(event)
        if existing is None:
            rows = (
                await conn.execute(
                    text(
                        """
                        select id, event_id, user_id, question_id, answer_id, skipped,
                               question_version, source, answered_at, created_at
                        from public.behavior_processing_context_answers
                        where event_id = cast(:event_id as uuid)
                          and user_id = cast(:user_id as uuid)
                        order by created_at
                        """
                    ),
                    {"event_id": event.id, "user_id": event.user_id},
                )
            ).mappings()
            snapshot = _snapshot_rows([answer_from_row(row) for row in rows])
            event.interpretation_json = merge_closed_snapshot(
                event.interpretation_json, snapshot
            )
        else:
            snapshot = existing
        _maybe_set_status(event, next_status)
        await conn.execute(
            text(
                """
                update public.behavior_events
                set status = :status,
                    interpretation_json = cast(:interpretation_json as jsonb)
                where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
                """
            ),
            {
                "id": event.id,
                "user_id": event.user_id,
                "status": event.status.value,
                "interpretation_json": json.dumps(event.interpretation_json),
            },
        )
    return snapshot
