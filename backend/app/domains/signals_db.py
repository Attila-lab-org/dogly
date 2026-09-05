"""PostgreSQL repository for Dogly Signals.

Used when DATABASE_URL is configured. Every query scopes ownership explicitly;
the API connection never relies on client-side RLS context.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.contracts.api import SignalExperimentCreate
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import SignalCategory
from app.domains.models import SignalExperimentRec, SignalMapEntryRec
from app.domains.signals import SAFE_SOUND_KEYS, result_summary


def _record(row: Mapping[str, Any]) -> dict[str, Any]:
    data = dict(row)
    for key in ("id", "dog_id", "user_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return data


async def _owned_dog_name(conn: AsyncConnection, *, user_id: str, dog_id: str) -> str:
    row = (
        await conn.execute(
            text("select name from public.dogs where id = :dog_id and owner_id = :user_id"),
            {"dog_id": dog_id, "user_id": user_id},
        )
    ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Dog not found")
    return str(row["name"])


async def _ensure_map(conn: AsyncConnection, *, user_id: str, dog_id: str) -> None:
    await conn.execute(
        text(
            """
            insert into public.signal_map_entries (dog_id, user_id, category)
            select :dog_id, :user_id, category
            from unnest(cast(:categories as text[])) as category
            on conflict (dog_id, category) do nothing
            """
        ),
        {
            "dog_id": dog_id,
            "user_id": user_id,
            "categories": [category.value for category in SignalCategory],
        },
    )


async def list_signal_map(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> list[SignalMapEntryRec]:
    async with engine.begin() as conn:
        await _owned_dog_name(conn, user_id=user_id, dog_id=dog_id)
        await _ensure_map(conn, user_id=user_id, dog_id=dog_id)
        rows = (
            await conn.execute(
                text(
                    """
                    select dog_id, user_id, category, state, attempt_count,
                           confirm_count, contradict_count, unknown_count,
                           last_summary, updated_at
                    from public.signal_map_entries
                    where dog_id = :dog_id and user_id = :user_id
                    order by category
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()
    return [SignalMapEntryRec.model_validate(_record(row)) for row in rows]


async def list_signal_experiments(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> list[SignalExperimentRec]:
    async with engine.connect() as conn:
        await _owned_dog_name(conn, user_id=user_id, dog_id=dog_id)
        rows = (
            await conn.execute(
                text(
                    """
                    select id, dog_id, user_id, client_request_id, category,
                           sound_key, status, observed_behaviors,
                           reaction_latency_ms, result_summary, owner_feedback,
                           created_at
                    from public.signal_experiments
                    where dog_id = :dog_id and user_id = :user_id
                    order by created_at desc, id desc
                    limit 100
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()
    return [SignalExperimentRec.model_validate(_record(row)) for row in rows]


async def create_signal_experiment(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    payload: SignalExperimentCreate,
) -> SignalExperimentRec:
    if payload.sound_key not in SAFE_SOUND_KEYS[payload.category]:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Sound key is not allowed for this category.")

    async with engine.begin() as conn:
        dog_name = await _owned_dog_name(conn, user_id=user_id, dog_id=dog_id)
        existing = (
            await conn.execute(
                text(
                    """
                    select id, dog_id, user_id, client_request_id, category,
                           sound_key, status, observed_behaviors,
                           reaction_latency_ms, result_summary, owner_feedback,
                           created_at
                    from public.signal_experiments
                    where user_id = :user_id and client_request_id = :client_request_id
                    """
                ),
                {"user_id": user_id, "client_request_id": payload.client_request_id},
            )
        ).mappings().first()
        if existing:
            if str(existing["dog_id"]) != dog_id or existing["category"] != payload.category.value:
                raise ApiError(
                    ErrorCode.IDEMPOTENCY_CONFLICT,
                    "client_request_id was reused with different experiment data.",
                )
            return SignalExperimentRec.model_validate(_record(existing))

        summary = result_summary(dog_name, payload.observed_behaviors)
        inserted = (
            await conn.execute(
                text(
                    """
                    insert into public.signal_experiments (
                      dog_id, user_id, client_request_id, category, sound_key,
                      observed_behaviors, reaction_latency_ms, result_summary,
                      owner_feedback
                    ) values (
                      :dog_id, :user_id, :client_request_id, :category, :sound_key,
                      cast(:observed_behaviors as text[]), :reaction_latency_ms,
                      :result_summary, :owner_feedback
                    )
                    returning id, dog_id, user_id, client_request_id, category,
                              sound_key, status, observed_behaviors,
                              reaction_latency_ms, result_summary, owner_feedback,
                              created_at
                    """
                ),
                {
                    "dog_id": dog_id,
                    "user_id": user_id,
                    "client_request_id": payload.client_request_id,
                    "category": payload.category.value,
                    "sound_key": payload.sound_key,
                    "observed_behaviors": [item.value for item in payload.observed_behaviors],
                    "reaction_latency_ms": payload.reaction_latency_ms,
                    "result_summary": summary,
                    "owner_feedback": payload.owner_feedback.value if payload.owner_feedback else None,
                },
            )
        ).mappings().one()

        await _ensure_map(conn, user_id=user_id, dog_id=dog_id)
        await conn.execute(
            text(
                """
                update public.signal_map_entries
                set attempt_count = attempt_count + 1,
                    confirm_count = confirm_count + case when :feedback = 'YES' then 1 else 0 end,
                    contradict_count = contradict_count + case when :feedback = 'NO' then 1 else 0 end,
                    unknown_count = unknown_count + case when :feedback = 'UNKNOWN' then 1 else 0 end,
                    state = case
                      when attempt_count + 1 >= 3
                       and confirm_count + case when :feedback = 'YES' then 1 else 0 end >= 2
                        then 'RECURRING'
                      when attempt_count + 1 >= 2 then 'LEARNING'
                      else 'DISCOVERING'
                    end,
                    last_summary = :result_summary
                where dog_id = :dog_id and user_id = :user_id and category = :category
                """
            ),
            {
                "feedback": payload.owner_feedback.value if payload.owner_feedback else None,
                "result_summary": summary,
                "dog_id": dog_id,
                "user_id": user_id,
                "category": payload.category.value,
            },
        )
    return SignalExperimentRec.model_validate(_record(inserted))
