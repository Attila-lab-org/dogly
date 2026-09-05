"""PostgreSQL repository for personal patterns."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import PatternReviewRequest
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import ELIGIBLE_PATTERN_STATES, PatternState
from app.domains import dogs_db
from app.domains.models import PersonalPatternRec
from app.providers.base import EligiblePatternSummary


def _record(row: Mapping[str, Any]) -> dict[str, Any]:
    data = dict(row)
    for key in ("id", "dog_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return data


def _pattern(row: Mapping[str, Any]) -> PersonalPatternRec:
    data = _record(row)
    data["reliability_band"] = str(data.get("reliability_band") or "low").lower()
    return PersonalPatternRec.model_validate(data)


async def list_visible_patterns(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> list[PersonalPatternRec]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    states = [state.value for state in ELIGIBLE_PATTERN_STATES | {PatternState.CONTESTED}]
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select id, dog_id, title, state, support_count, confirm_count,
                           contradict_count, reliability_band, version,
                           first_seen, last_seen
                    from public.personal_patterns
                    where dog_id = :dog_id and state = any(cast(:states as text[]))
                    order by last_seen desc nulls last, id desc
                    """
                ),
                {"dog_id": dog_id, "states": states},
            )
        ).mappings().all()
    return [_pattern(row) for row in rows]


async def review_pattern(
    engine: AsyncEngine,
    *,
    user_id: str,
    pattern_id: str,
    payload: PatternReviewRequest,
) -> PersonalPatternRec:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select p.id, p.dog_id, p.title, p.state, p.support_count,
                           p.confirm_count, p.contradict_count, p.reliability_band,
                           p.version, p.first_seen, p.last_seen
                    from public.personal_patterns p
                    join public.dogs d on d.id = p.dog_id
                    where p.id = :pattern_id and d.owner_id = :user_id
                    """
                ),
                {"pattern_id": pattern_id, "user_id": user_id},
            )
        ).mappings().first()
        if not row:
            raise ApiError(ErrorCode.NOT_FOUND, "Pattern not found")

        if payload.action == "contest":
            next_state = PatternState.CONTESTED.value
            version_increment = 0
            confirm_increment = 0
        elif payload.action == "archive":
            next_state = PatternState.ARCHIVED.value
            version_increment = 0
            confirm_increment = 0
        elif payload.action == "confirm":
            next_state = str(row["state"])
            version_increment = 0
            confirm_increment = 1
        else:
            next_state = str(row["state"])
            version_increment = 1
            confirm_increment = 0

        updated = (
            await conn.execute(
                text(
                    """
                    update public.personal_patterns
                    set state = :state,
                        version = version + :version_increment,
                        confirm_count = confirm_count + :confirm_increment,
                        last_seen = now(),
                        updated_at = now()
                    where id = :pattern_id
                    returning id, dog_id, title, state, support_count, confirm_count,
                              contradict_count, reliability_band, version,
                              first_seen, last_seen
                    """
                ),
                {
                    "pattern_id": pattern_id,
                    "state": next_state,
                    "version_increment": version_increment,
                    "confirm_increment": confirm_increment,
                },
            )
        ).mappings().one()
    return _pattern(updated)


async def list_eligible_for_reasoner(
    engine: AsyncEngine, *, dog_id: str
) -> list[EligiblePatternSummary]:
    states = [state.value for state in ELIGIBLE_PATTERN_STATES]
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select id, state, title, support_count, confirm_count
                    from public.personal_patterns
                    where dog_id = :dog_id and state = any(cast(:states as text[]))
                    order by last_seen desc nulls last, id desc
                    limit 20
                    """
                ),
                {"dog_id": dog_id, "states": states},
            )
        ).mappings().all()
    return [
        EligiblePatternSummary(
            pattern_id=str(row["id"]),
            state=str(row["state"]),
            title=str(row["title"]),
            support_summary=f"support={row['support_count']} confirm={row['confirm_count']}",
        )
        for row in rows
    ]
