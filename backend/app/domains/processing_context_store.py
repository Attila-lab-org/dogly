"""Event-scoped processing context answers. Memory store + Postgres."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domains.models import ProcessingContextAnswerRec
from app.domains.processing_context import QUESTION_BANK_VERSION
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
            await conn.execute(
                text(
                    """
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
                ),
                rec.model_dump(),
            )
        ).mappings().one()
    return answer_from_row(row)
