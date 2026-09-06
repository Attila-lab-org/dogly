"""PostgreSQL repository for owner-scoped lifestyle and advice outcomes."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import (
    AdviceOutcomeCreate,
    AdviceOutcomeOut,
    DogLifestyleOut,
    DogLifestylePatch,
)
from app.contracts.errors import ApiError, ErrorCode
from app.domains import dogs_db
from app.knowledge.models import AdviceOutcomeValue
from app.knowledge.registry import get_registry


def _lifestyle_out(row: Mapping[str, Any], dog_id: str) -> DogLifestyleOut:
    return DogLifestyleOut(
        dog_id=dog_id,
        routine=dict(row.get("routine_json") or {}),
        preferences=dict(row.get("preferences_json") or {}),
        provenance=dict(row.get("provenance_json") or {}),
        last_confirmed_at=row.get("last_confirmed_at"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


async def get_lifestyle(engine: AsyncEngine, user_id: str, dog_id: str) -> DogLifestyleOut:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select routine_json, preferences_json, provenance_json,
                           last_confirmed_at, created_at, updated_at
                    from public.dog_lifestyle_profiles
                    where dog_id = cast(:dog_id as uuid)
                      and user_id = cast(:user_id as uuid)
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().first()
    return _lifestyle_out(row, dog_id) if row else DogLifestyleOut(dog_id=dog_id)


async def patch_lifestyle(
    engine: AsyncEngine,
    user_id: str,
    dog_id: str,
    payload: DogLifestylePatch,
) -> DogLifestyleOut:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.dog_lifestyle_profiles (
                      dog_id, user_id, routine_json, preferences_json,
                      provenance_json, last_confirmed_at
                    ) values (
                      cast(:dog_id as uuid), cast(:user_id as uuid),
                      cast(:routine as jsonb), cast(:preferences as jsonb),
                      cast(:provenance as jsonb),
                      case when :confirm then now() else null end
                    )
                    on conflict (dog_id) do update set
                      routine_json = dog_lifestyle_profiles.routine_json || excluded.routine_json,
                      preferences_json = dog_lifestyle_profiles.preferences_json || excluded.preferences_json,
                      provenance_json = dog_lifestyle_profiles.provenance_json || excluded.provenance_json,
                      last_confirmed_at = case
                        when :confirm then now()
                        else dog_lifestyle_profiles.last_confirmed_at
                      end,
                      updated_at = now()
                    returning routine_json, preferences_json, provenance_json,
                              last_confirmed_at, created_at, updated_at
                    """
                ),
                {
                    "dog_id": dog_id,
                    "user_id": user_id,
                    "routine": json.dumps(payload.routine_update()),
                    "preferences": json.dumps(payload.preferences_update()),
                    "provenance": json.dumps(payload.provenance or {}),
                    "confirm": payload.confirm,
                },
            )
        ).mappings().one()
    return _lifestyle_out(row, dog_id)


async def record_advice_outcome(
    engine: AsyncEngine,
    user_id: str,
    event_id: str,
    payload: AdviceOutcomeCreate,
) -> AdviceOutcomeOut:
    valid_codes = {entry.code for entry in get_registry().advice_catalog}
    if payload.advice_code not in valid_codes:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Unknown advice code")
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.advice_outcomes (
                      event_id, dog_id, user_id, advice_code, outcome
                    )
                    select e.id, e.dog_id, e.user_id, :advice_code, :outcome
                    from public.behavior_events e
                    where e.id = cast(:event_id as uuid)
                      and e.user_id = cast(:user_id as uuid)
                      and e.interpretation_json->'advice'->>'code' = :advice_code
                    returning id, event_id, dog_id, advice_code, outcome, created_at
                    """
                ),
                {
                    "event_id": event_id,
                    "user_id": user_id,
                    "advice_code": payload.advice_code,
                    "outcome": payload.outcome.value,
                },
            )
        ).mappings().first()
    if not row:
        raise ApiError(
            ErrorCode.NOT_FOUND,
            "Behavior event or matching advice not found",
        )
    data = dict(row)
    for key in ("id", "event_id", "dog_id"):
        data[key] = str(data[key])
    return AdviceOutcomeOut.model_validate(data)


async def get_latest_advice_outcome(
    engine: AsyncEngine,
    user_id: str,
    event_id: str,
) -> AdviceOutcomeValue | None:
    async with engine.connect() as conn:
        value = (
            await conn.execute(
                text(
                    """
                    select outcome
                    from public.advice_outcomes
                    where event_id = cast(:event_id as uuid)
                      and user_id = cast(:user_id as uuid)
                    order by created_at desc, id desc
                    limit 1
                    """
                ),
                {"event_id": event_id, "user_id": user_id},
            )
        ).scalar_one_or_none()
    return AdviceOutcomeValue(value) if value is not None else None
