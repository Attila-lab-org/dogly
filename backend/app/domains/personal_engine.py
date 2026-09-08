"""Deterministic Personal Engine (Spec V1 sez. 17).

Patterns are derived from completed events only. A single analysis never
becomes ESTABLISHED. Owner stories and lifestyle feed the Knowledge Score,
not the pattern state machine.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.api.deps import AppState
from app.contracts.taxonomy import PatternState
from app.domains.models import BehaviorEventRec, PersonalPatternRec
from app.domains.repository import InMemoryStore, new_id, now_utc

logger = logging.getLogger(__name__)

KNOWLEDGE_SCORE_VERSION = "v1"


def pattern_title_for_intent(intent: str) -> str:
    return f"Ricorrenza: {intent}"


def derive_pattern_state(support_count: int, confirm_count: int) -> PatternState | None:
    """Anti-bias: one event is never a pattern; ESTABLISHED needs owner confirm."""
    if support_count < 2:
        return None
    if support_count >= 8 and confirm_count >= 1:
        return PatternState.ESTABLISHED
    if support_count >= 4:
        return PatternState.PRELIMINARY
    return PatternState.CANDIDATE


def reliability_for(state: PatternState) -> str:
    if state == PatternState.ESTABLISHED:
        return "high"
    if state == PatternState.PRELIMINARY:
        return "medium"
    return "low"


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def score_from_components(components: dict[str, float]) -> float:
    return round(_clamp(sum(components.values())), 3)


async def on_behavior_completed(state: AppState, event: BehaviorEventRec) -> None:
    """Best-effort: analysis success must not fail because scoring failed."""
    intent = event.primary_intent
    if intent is None:
        return
    intent_value = intent.value if hasattr(intent, "value") else str(intent)
    try:
        if state.engine is not None:
            await upsert_intent_pattern_db(
                state.engine,
                dog_id=event.dog_id,
                event_id=event.id,
                intent=intent_value,
            )
            await recalculate_knowledge_score_db(state.engine, dog_id=event.dog_id)
        else:
            upsert_intent_pattern_memory(
                state.store,
                dog_id=event.dog_id,
                event_id=event.id,
                intent=intent_value,
            )
            recalculate_knowledge_score_memory(state.store, dog_id=event.dog_id)
    except Exception:
        logger.exception("Personal Engine update failed for event %s", event.id)


def upsert_intent_pattern_memory(
    store: InMemoryStore, *, dog_id: str, event_id: str, intent: str
) -> PersonalPatternRec | None:
    support = sum(
        1
        for item in store.behavior_events.values()
        if item.dog_id == dog_id
        and item.status.value == "COMPLETED"
        and item.primary_intent is not None
        and (
            item.primary_intent.value
            if hasattr(item.primary_intent, "value")
            else str(item.primary_intent)
        )
        == intent
    )
    existing = next(
        (
            pattern
            for pattern in store.patterns.values()
            if pattern.dog_id == dog_id and pattern.title == pattern_title_for_intent(intent)
        ),
        None,
    )
    confirm = existing.confirm_count if existing else 0
    state = derive_pattern_state(support, confirm)
    if state is None:
        return None
    now = now_utc()
    if existing is None:
        existing = PersonalPatternRec(
            id=new_id(),
            dog_id=dog_id,
            title=pattern_title_for_intent(intent),
            state=state,
            support_count=support,
            confirm_count=0,
            contradict_count=0,
            reliability_band=reliability_for(state),
            version=1,
            first_seen=now,
            last_seen=now,
        )
        store.patterns[existing.id] = existing
    else:
        existing.support_count = support
        existing.state = state
        existing.reliability_band = reliability_for(state)
        existing.last_seen = now
        existing.version += 1
    store.pattern_event_links.add((existing.id, event_id))
    return existing


def recalculate_knowledge_score_memory(store: InMemoryStore, *, dog_id: str) -> dict[str, Any]:
    completed = [
        event
        for event in store.behavior_events.values()
        if event.dog_id == dog_id and event.status.value == "COMPLETED"
    ]
    intents = {
        (
            event.primary_intent.value
            if hasattr(event.primary_intent, "value")
            else str(event.primary_intent)
        )
        for event in completed
        if event.primary_intent is not None
    }
    stories = [
        row
        for row in store.owner_reported_observations.values()
        if row.get("dog_id") == dog_id and row.get("status") == "CONFIRMED"
    ]
    lifestyle = store.dog_lifestyle_profiles.get(dog_id) or {}
    lifestyle_fields = 0
    for blob in (lifestyle.get("routine") or {}, lifestyle.get("preferences") or {}):
        if isinstance(blob, dict):
            lifestyle_fields += sum(1 for value in blob.values() if value not in (None, "", [], {}))
    fecal = [
        event
        for event in store.fecal_events.values()
        if event.dog_id == dog_id and event.status == "COMPLETED"
    ]
    feedback = sum(
        1
        for event in completed
        if event.id in store.behavior_feedback
    )
    components = {
        "completed_events": round(min(len(completed) / 10, 1.0) * 0.35, 3),
        "intent_diversity": round(min(len(intents) / 6, 1.0) * 0.20, 3),
        "owner_stories": round(min(len(stories) / 3, 1.0) * 0.15, 3),
        "lifestyle": round(min(lifestyle_fields / 8, 1.0) * 0.15, 3),
        "digestive": round(min(len(fecal) / 5, 1.0) * 0.10, 3),
        "feedback": round(min(feedback / 5, 1.0) * 0.05, 3),
    }
    record = {
        "dog_id": dog_id,
        "score": score_from_components(components),
        "components": components,
        "version": KNOWLEDGE_SCORE_VERSION,
        "calculated_at": now_utc(),
    }
    store.knowledge_scores.append(record)
    return record


async def upsert_intent_pattern_db(
    engine: AsyncEngine, *, dog_id: str, event_id: str, intent: str
) -> None:
    title = pattern_title_for_intent(intent)
    async with engine.begin() as conn:
        await conn.execute(
            text("select id from public.dogs where id = cast(:dog_id as uuid) for update"),
            {"dog_id": dog_id},
        )
        support = (
            await conn.execute(
                text(
                    """
                    select count(*)::int as n
                    from public.behavior_events
                    where dog_id = cast(:dog_id as uuid)
                      and status = 'COMPLETED'
                      and primary_intent = :intent
                    """
                ),
                {"dog_id": dog_id, "intent": intent},
            )
        ).mappings().one()["n"]
        existing = (
            await conn.execute(
                text(
                    """
                    select id, confirm_count
                    from public.personal_patterns
                    where dog_id = cast(:dog_id as uuid) and title = :title
                    for update
                    """
                ),
                {"dog_id": dog_id, "title": title},
            )
        ).mappings().first()
        confirm = int(existing["confirm_count"]) if existing else 0
        state = derive_pattern_state(int(support), confirm)
        if state is None:
            return
        if existing is None:
            inserted = (
                await conn.execute(
                    text(
                        """
                        insert into public.personal_patterns (
                          dog_id, title, state, support_count, confirm_count,
                          contradict_count, reliability_band, version,
                          first_seen, last_seen
                        ) values (
                          cast(:dog_id as uuid), :title, :state, :support, 0,
                          0, :reliability, 1, now(), now()
                        )
                        returning id
                        """
                    ),
                    {
                        "dog_id": dog_id,
                        "title": title,
                        "state": state.value,
                        "support": int(support),
                        "reliability": reliability_for(state).upper(),
                    },
                )
            ).mappings().one()
            pattern_id = str(inserted["id"])
        else:
            pattern_id = str(existing["id"])
            await conn.execute(
                text(
                    """
                    update public.personal_patterns
                    set state = :state,
                        support_count = :support,
                        reliability_band = :reliability,
                        last_seen = now(),
                        version = version + 1,
                        updated_at = now()
                    where id = cast(:id as uuid)
                    """
                ),
                {
                    "id": pattern_id,
                    "state": state.value,
                    "support": int(support),
                    "reliability": reliability_for(state).upper(),
                },
            )
        await conn.execute(
            text(
                """
                insert into internal.pattern_event_links (
                  pattern_id, event_id, relation, similarity
                ) values (
                  cast(:pattern_id as uuid), cast(:event_id as uuid), 'SUPPORT', 1
                )
                on conflict (pattern_id, event_id) do nothing
                """
            ),
            {"pattern_id": pattern_id, "event_id": event_id},
        )


async def recalculate_knowledge_score_db(engine: AsyncEngine, *, dog_id: str) -> None:
    async with engine.begin() as conn:
        stats = (
            await conn.execute(
                text(
                    """
                    select
                      (select count(*) from public.behavior_events
                        where dog_id = cast(:dog_id as uuid) and status = 'COMPLETED'
                      )::int as completed_events,
                      (select count(distinct primary_intent) from public.behavior_events
                        where dog_id = cast(:dog_id as uuid)
                          and status = 'COMPLETED'
                          and primary_intent is not null
                      )::int as unique_intents,
                      (select count(*) from public.owner_reported_observations
                        where dog_id = cast(:dog_id as uuid) and status = 'CONFIRMED'
                      )::int as owner_stories,
                      (select count(*) from public.fecal_events
                        where dog_id = cast(:dog_id as uuid) and status = 'COMPLETED'
                      )::int as digestive_events,
                      (select count(*) from public.behavior_feedback f
                        join public.behavior_events e on e.id = f.event_id
                        where e.dog_id = cast(:dog_id as uuid)
                      )::int as feedback_count
                    """
                ),
                {"dog_id": dog_id},
            )
        ).mappings().one()
        lifestyle = (
            await conn.execute(
                text(
                    """
                    select routine_json, preferences_json
                    from public.dog_lifestyle_profiles
                    where dog_id = cast(:dog_id as uuid)
                    """
                ),
                {"dog_id": dog_id},
            )
        ).mappings().first()
    lifestyle_fields = 0
    if lifestyle:
        for blob in (lifestyle.get("routine_json") or {}, lifestyle.get("preferences_json") or {}):
            if isinstance(blob, dict):
                lifestyle_fields += sum(
                    1 for value in blob.values() if value not in (None, "", [], {})
                )
    components = {
        "completed_events": round(min(int(stats["completed_events"]) / 10, 1.0) * 0.35, 3),
        "intent_diversity": round(min(int(stats["unique_intents"]) / 6, 1.0) * 0.20, 3),
        "owner_stories": round(min(int(stats["owner_stories"]) / 3, 1.0) * 0.15, 3),
        "lifestyle": round(min(lifestyle_fields / 8, 1.0) * 0.15, 3),
        "digestive": round(min(int(stats["digestive_events"]) / 5, 1.0) * 0.10, 3),
        "feedback": round(min(int(stats["feedback_count"]) / 5, 1.0) * 0.05, 3),
    }
    score = score_from_components(components)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                insert into public.knowledge_scores (
                  dog_id, score, components, version
                ) values (
                  cast(:dog_id as uuid), :score, cast(:components as jsonb), :version
                )
                """
            ),
            {
                "dog_id": dog_id,
                "score": score,
                "components": json.dumps(components),
                "version": KNOWLEDGE_SCORE_VERSION,
            },
        )
