"""Deterministic Personal Engine (Spec V1 sez. 17).

Patterns are derived from completed behavior events only. The behavioral
Knowledge Score measures usable behavioral evidence, context, time, modality
quality, pattern consistency and owner validation. Digestive data never enters
this score.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.api.deps import AppState
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ContextBucket, IntentCode, PatternState
from app.domains.behavior_decision import extract_behavior_signals
from app.domains.models import BehaviorEventRec, PersonalPatternRec
from app.domains.repository import InMemoryStore, new_id, now_utc

logger = logging.getLogger(__name__)

KNOWLEDGE_SCORE_VERSION = "behavior-knowledge/v2"


def pattern_title_for_intent(intent: str) -> str:
    titles = {
        IntentCode.PLAY_INTERACTION.value: "Cerca spesso il gioco",
        IntentCode.ATTENTION_REQUEST.value: "Cerca spesso il tuo coinvolgimento",
        IntentCode.OUTSIDE_REQUEST.value: "Ti segnala spesso che vuole uscire",
        IntentCode.ALERT_VIGILANCE.value: "Si mette spesso in ascolto e osservazione",
        IntentCode.DISCOMFORT_AVOIDANCE.value: "In alcuni momenti preferisce prendere distanza",
        IntentCode.FEAR_INSECURITY.value: "In alcune situazioni cerca più sicurezza",
        IntentCode.HIGH_AROUSAL.value: "In alcune situazioni si attiva molto",
        IntentCode.FRUSTRATION.value: "In alcune situazioni fatica ad aspettare",
        IntentCode.RELAX_REST.value: "Si rilassa spesso in momenti simili",
        IntentCode.RESOURCE_TENSION.value: "Con alcune risorse mostra più tensione",
    }
    return titles.get(intent, "Un comportamento che si ripete")


def derive_pattern_state(support_count: int, confirm_count: int) -> PatternState | None:
    """Thresholds apply to independent episode buckets, not raw clip count."""
    if support_count < 2:
        return None
    if support_count >= 4 and confirm_count >= 1:
        return PatternState.ESTABLISHED
    if support_count >= 3:
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


def _pattern_signature(
    event: BehaviorEventRec,
    *,
    intent: str,
) -> tuple[str, str, dict[str, Any], list[dict[str, str]]]:
    interpretation = event.interpretation_json or {}
    raw_context = interpretation.get("context_bucket") or "UNKNOWN"
    try:
        context = ContextBucket(str(raw_context))
    except ValueError:
        context = ContextBucket.UNKNOWN
    decision = interpretation.get("decision_audit") or {}
    selected = next(
        (
            item
            for item in decision.get("candidates") or []
            if item.get("intent") == intent
        ),
        None,
    )
    signal_keys = sorted((selected or {}).get("supporting_signals") or [])
    if not signal_keys and event.observation_json:
        try:
            observation = ObservationContract.model_validate(event.observation_json)
            signal_keys = sorted(extract_behavior_signals(observation, context))
        except (TypeError, ValueError):
            signal_keys = []
    owner_context = [
        {
            "question_id": str(item.get("question_id") or item.get("key") or ""),
            "answer_id": str(item.get("answer_id") or item.get("value") or ""),
        }
        for item in (interpretation.get("processing_owner_context") or [])
        if isinstance(item, dict)
    ]
    candidate = interpretation.get("personal_pattern_candidate") or {}
    raw_semantic_key = str(candidate.get("semantic_key") or "").casefold()
    semantic_key = re.sub(r"[^a-z0-9à-ÿ]+", " ", raw_semantic_key).strip()
    action_terms = sorted(
        {
            re.sub(r"[^a-z0-9à-ÿ]+", " ", str(item.get("action") or "").casefold()).strip()
            for item in (event.observation_json or {}).get("salient_actions", [])
            if isinstance(item, dict) and item.get("action")
        }
    )
    # Model-authored meaning is preferred. The fallback groups by broad meaning
    # and context, deliberately ignoring tiny technical signal differences.
    meaning_key = semantic_key or intent.casefold()
    context_key = str(candidate.get("context_key") or context.value).casefold()
    signature = {
        "meaning_key": meaning_key,
        "title": str(candidate.get("title") or pattern_title_for_intent(intent)),
        "support_summary": str(candidate.get("support_summary") or ""),
        "intent": intent,
        "context_bucket": context.value,
        "context_key": context_key,
        "salient_actions": action_terms,
        "signal_families": sorted({key.split(".", 1)[0] for key in signal_keys}),
    }
    encoded = json.dumps(signature, sort_keys=True, separators=(",", ":"))
    pattern_key = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    return pattern_key, context.value, signature, owner_context


def _episode_bucket(value: datetime) -> str:
    """Six-hour buckets prevent burst uploads from counting as independent."""
    aware = value
    return f"{aware.date().isoformat()}:{aware.hour // 6}"


def _pattern_title(intent: str, signature: dict[str, Any]) -> str:
    return str(signature.get("title") or pattern_title_for_intent(intent))[:120]


def _semantic_tokens(value: str) -> set[str]:
    stop = {"il", "la", "lo", "un", "una", "di", "a", "the", "to", "and", "dog", "cane"}
    return {
        token
        for token in re.findall(r"[a-z0-9à-ÿ]{3,}", value.casefold())
        if token not in stop
    }


def semantic_pattern_similarity(
    left: dict[str, Any],
    right: dict[str, Any],
) -> float:
    """Meaning/context similarity; technical signal equality is not required."""
    left_tokens = _semantic_tokens(str(left.get("meaning_key") or ""))
    right_tokens = _semantic_tokens(str(right.get("meaning_key") or ""))
    if not left_tokens or not right_tokens:
        return 0.0
    union = left_tokens | right_tokens
    meaning = len(left_tokens & right_tokens) / len(union)
    context_bonus = (
        0.15
        if left.get("context_key")
        and left.get("context_key") == right.get("context_key")
        else 0.0
    )
    action_left = set(left.get("salient_actions") or [])
    action_right = set(right.get("salient_actions") or [])
    action_bonus = (
        0.15 * len(action_left & action_right) / len(action_left | action_right)
        if action_left and action_right
        else 0.0
    )
    return min(1.0, meaning + context_bonus + action_bonus)


def _closest_pattern_key(
    signature: dict[str, Any],
    candidates: list[tuple[str, dict[str, Any]]],
) -> str | None:
    scored = [
        (semantic_pattern_similarity(signature, candidate), pattern_key)
        for pattern_key, candidate in candidates
    ]
    if not scored:
        return None
    score, pattern_key = max(scored)
    return pattern_key if score >= 0.65 else None


async def on_behavior_completed(state: AppState, event: BehaviorEventRec) -> None:
    """Best-effort: analysis success must not fail because scoring failed."""
    intent = event.primary_intent
    if intent is None:
        return
    intent_value = intent.value if hasattr(intent, "value") else str(intent)
    if intent_value in {
        IntentCode.AMBIGUOUS.value,
        IntentCode.INSUFFICIENT.value,
    }:
        return
    try:
        if state.engine is not None:
            await upsert_intent_pattern_db(
                state.engine,
                event=event,
                intent=intent_value,
            )
            await recalculate_knowledge_score_db(state.engine, dog_id=event.dog_id)
        else:
            upsert_intent_pattern_memory(
                state.store,
                event=event,
                intent=intent_value,
            )
            recalculate_knowledge_score_memory(state.store, dog_id=event.dog_id)
    except Exception:
        logger.exception("Personal Engine update failed for event %s", event.id)


async def on_behavior_feedback(
    state: AppState,
    *,
    event_id: str,
) -> None:
    """Refresh pattern validation and behavioral knowledge after owner feedback."""
    try:
        if state.engine is not None:
            dog_id = await refresh_pattern_feedback_db(
                state.engine,
                event_id=event_id,
            )
            if dog_id is not None:
                await recalculate_knowledge_score_db(state.engine, dog_id=dog_id)
            return
        event = state.store.behavior_events.get(event_id)
        if event is None or event.primary_intent is None:
            return
        intent = (
            event.primary_intent.value
            if hasattr(event.primary_intent, "value")
            else str(event.primary_intent)
        )
        signature = state.store.behavior_pattern_signatures.get(event_id)
        if signature is not None:
            related_ids = {
                signature_event_id
                for signature_event_id, item in (
                    state.store.behavior_pattern_signatures.items()
                )
                if item["dog_id"] == event.dog_id
                and item["pattern_key"] == signature["pattern_key"]
            }
        else:
            related_ids = {
                item.id
                for item in state.store.behavior_events.values()
                if item.dog_id == event.dog_id
                and item.primary_intent is not None
                and (
                    item.primary_intent.value
                    if hasattr(item.primary_intent, "value")
                    else str(item.primary_intent)
                )
                == intent
            }
        confirmations = sum(
            state.store.behavior_feedback[item_id].value.value == "YES"
            for item_id in related_ids
            if item_id in state.store.behavior_feedback
        )
        contradictions = sum(
            state.store.behavior_feedback[item_id].value.value == "NO"
            for item_id in related_ids
            if item_id in state.store.behavior_feedback
        )
        for pattern in state.store.patterns.values():
            if pattern.dog_id != event.dog_id:
                continue
            if signature is not None and pattern.pattern_key != signature["pattern_key"]:
                continue
            if signature is None and pattern.title != pattern_title_for_intent(intent):
                continue
            pattern.confirm_count = confirmations
            pattern.contradict_count = contradictions
            if contradictions >= 2 and contradictions > confirmations:
                pattern.state = PatternState.CONTESTED
            else:
                state_value = derive_pattern_state(
                    pattern.support_count,
                    confirmations,
                )
                if state_value is not None:
                    pattern.state = state_value
            pattern.reliability_band = reliability_for(pattern.state)
        recalculate_knowledge_score_memory(state.store, dog_id=event.dog_id)
    except Exception:
        logger.exception("Personal Engine feedback update failed for event %s", event_id)


async def refresh_pattern_feedback_db(
    engine: AsyncEngine,
    *,
    event_id: str,
) -> str | None:
    async with engine.begin() as conn:
        event = (
            await conn.execute(
                text(
                    """
                    select e.dog_id, e.primary_intent, s.pattern_key
                    from public.behavior_events e
                    left join internal.behavior_pattern_signatures s
                      on s.event_id = e.id
                    where e.id = cast(:event_id as uuid)
                    """
                ),
                {"event_id": event_id},
            )
        ).mappings().first()
        if event is None or event["primary_intent"] is None:
            return None
        dog_id = str(event["dog_id"])
        intent = str(event["primary_intent"])
        pattern_key = event["pattern_key"]
        counts = (
            await conn.execute(
                text(
                    """
                    select
                      count(*) filter (where f.value = 'YES')::int as confirmations,
                      count(*) filter (where f.value = 'NO')::int as contradictions
                    from public.behavior_feedback f
                    join public.behavior_events e on e.id = f.event_id
                    left join internal.behavior_pattern_signatures s
                      on s.event_id = e.id
                    where e.dog_id = cast(:dog_id as uuid)
                      and (
                        (:pattern_key is not null and s.pattern_key = :pattern_key)
                        or (:pattern_key is null and e.primary_intent = :intent)
                      )
                    """
                ),
                {
                    "dog_id": dog_id,
                    "intent": intent,
                    "pattern_key": pattern_key,
                },
            )
        ).mappings().one()
        patterns = (
            await conn.execute(
                text(
                    """
                    select id, support_count
                    from public.personal_patterns
                    where dog_id = cast(:dog_id as uuid)
                      and (
                        (:pattern_key is not null and pattern_key = :pattern_key)
                        or (
                          :pattern_key is null
                          and title = any(cast(:titles as text[]))
                        )
                      )
                    for update
                    """
                ),
                {
                    "dog_id": dog_id,
                    "pattern_key": pattern_key,
                    "titles": [
                        pattern_title_for_intent(intent),
                        f"Ricorrenza: {intent}",
                    ],
                },
            )
        ).mappings().all()
        confirmations = int(counts["confirmations"])
        contradictions = int(counts["contradictions"])
        for pattern in patterns:
            if contradictions >= 2 and contradictions > confirmations:
                next_state = PatternState.CONTESTED
            else:
                next_state = (
                    derive_pattern_state(
                        int(pattern["support_count"]),
                        confirmations,
                    )
                    or PatternState.CANDIDATE
                )
            await conn.execute(
                text(
                    """
                    update public.personal_patterns
                    set confirm_count = :confirmations,
                        contradict_count = :contradictions,
                        state = :state,
                        reliability_band = :reliability,
                        version = version + 1,
                        updated_at = now()
                    where id = cast(:pattern_id as uuid)
                    """
                ),
                {
                    "pattern_id": str(pattern["id"]),
                    "confirmations": confirmations,
                    "contradictions": contradictions,
                    "state": next_state.value,
                    "reliability": reliability_for(next_state).upper(),
                },
            )
    return dog_id


def upsert_intent_pattern_memory(
    store: InMemoryStore, *, event: BehaviorEventRec, intent: str
) -> PersonalPatternRec | None:
    dog_id = event.dog_id
    event_id = event.id
    pattern_key, context_bucket, signature, owner_context = _pattern_signature(
        event,
        intent=intent,
    )
    similar_key = _closest_pattern_key(
        signature,
        [
            (str(item["pattern_key"]), dict(item.get("signal_signature") or {}))
            for item in store.behavior_pattern_signatures.values()
            if item["dog_id"] == dog_id
        ],
    )
    pattern_key = similar_key or pattern_key
    previous_signature = store.behavior_pattern_signatures.get(event_id)
    store.behavior_pattern_signatures[event_id] = {
        "dog_id": dog_id,
        "pattern_key": pattern_key,
        "intent": intent,
        "context_bucket": context_bucket,
        "signal_signature": signature,
        "owner_context_signature": owner_context,
    }
    if previous_signature and previous_signature["pattern_key"] != pattern_key:
        old_key = previous_signature["pattern_key"]
        for pattern in list(store.patterns.values()):
            if pattern.dog_id != dog_id or pattern.pattern_key != old_key:
                continue
            store.pattern_event_links.discard((pattern.id, event_id))
            old_ids = {
                linked_id
                for linked_id, item in store.behavior_pattern_signatures.items()
                if item["dog_id"] == dog_id and item["pattern_key"] == old_key
            }
            old_support = len(
                {
                    _episode_bucket(store.behavior_events[item_id].created_at)
                    for item_id in old_ids
                    if item_id in store.behavior_events
                }
            )
            pattern.support_count = old_support
            if old_support < 2:
                pattern.state = PatternState.ARCHIVED
            pattern.version += 1
    matching_event_ids = {
        signature_event_id
        for signature_event_id, item in store.behavior_pattern_signatures.items()
        if item["dog_id"] == dog_id and item["pattern_key"] == pattern_key
    }
    support = len(
        {
            _episode_bucket(store.behavior_events[item_id].created_at)
            for item_id in matching_event_ids
            if item_id in store.behavior_events
        }
    )
    if support < 2:
        return None
    existing = next(
        (
            pattern
            for pattern in store.patterns.values()
            if pattern.dog_id == dog_id
            and pattern.pattern_key == pattern_key
        ),
        None,
    )
    linked_event_ids = matching_event_ids
    confirm = sum(
        store.behavior_feedback[item_id].value.value == "YES"
        for item_id in linked_event_ids
        if item_id in store.behavior_feedback
    )
    contradict = sum(
        store.behavior_feedback[item_id].value.value == "NO"
        for item_id in linked_event_ids
        if item_id in store.behavior_feedback
    )
    state = derive_pattern_state(support, confirm)
    if state is None:
        return None
    if contradict >= 2 and contradict > confirm:
        state = PatternState.CONTESTED
    now = now_utc()
    if existing is None:
        existing = PersonalPatternRec(
            id=new_id(),
            dog_id=dog_id,
            title=_pattern_title(intent, signature),
            state=state,
            support_count=support,
            confirm_count=confirm,
            contradict_count=contradict,
            reliability_band=reliability_for(state),
            version=1,
            first_seen=now,
            last_seen=now,
            pattern_key=pattern_key,
            intent_code=intent,
            context_bucket=context_bucket,
            signal_signature=signature,
            owner_context_signature=owner_context,
        )
        store.patterns[existing.id] = existing
    else:
        existing.title = _pattern_title(intent, signature)
        existing.support_count = support
        existing.confirm_count = confirm
        existing.contradict_count = contradict
        existing.state = state
        existing.reliability_band = reliability_for(state)
        existing.last_seen = now
        existing.version += 1
    for linked_event_id in linked_event_ids:
        store.pattern_event_links.add((existing.id, linked_event_id))
    return existing


def recalculate_knowledge_score_memory(store: InMemoryStore, *, dog_id: str) -> dict[str, Any]:
    completed = [
        event
        for event in store.behavior_events.values()
        if event.dog_id == dog_id and event.status.value == "COMPLETED"
    ]
    usable = [
        event
        for event in completed
        if event.primary_intent
        not in {None, IntentCode.AMBIGUOUS, IntentCode.INSUFFICIENT}
        and event.observation_json
    ]
    contexts = {
        str((event.interpretation_json or {}).get("context_bucket") or "UNKNOWN")
        for event in usable
    } - {"UNKNOWN"}
    active_days = {event.created_at.date() for event in usable}
    quality_points = [
        1.0
        if (event.observation_json or {})
        .get("capture_quality", {})
        .get("overall_quality")
        == "good"
        else 0.5
        for event in usable
    ]
    decisive_feedback = sum(
        1
        for event in usable
        if (
            feedback := store.behavior_feedback.get(event.id)
        )
        is not None
        and feedback.value.value in {"YES", "NO"}
    )
    patterns = [
        pattern for pattern in store.patterns.values() if pattern.dog_id == dog_id
    ]
    support = sum(pattern.support_count for pattern in patterns)
    contradictions = sum(pattern.contradict_count for pattern in patterns)
    consistency = (
        max(support - contradictions, 0) / support if support else 0.0
    )
    maturity = min(support / 8, 1.0)
    components = {
        "usable_volume": round(min(len(usable) / 20, 1.0) * 0.25, 3),
        "context_diversity": round(min(len(contexts) / 6, 1.0) * 0.20, 3),
        "temporal_diversity": round(min(len(active_days) / 12, 1.0) * 0.15, 3),
        "modality_quality": round(
            ((sum(quality_points) / len(quality_points)) if quality_points else 0)
            * 0.15,
            3,
        ),
        "pattern_consistency": round(consistency * maturity * 0.15, 3),
        "owner_validation": round(
            min(decisive_feedback / 10, 1.0) * 0.10,
            3,
        ),
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
    engine: AsyncEngine, *, event: BehaviorEventRec, intent: str
) -> None:
    dog_id = event.dog_id
    event_id = event.id
    pattern_key, context_bucket, signature, owner_context = _pattern_signature(
        event,
        intent=intent,
    )
    title = _pattern_title(intent, signature)
    async with engine.begin() as conn:
        previous_key = (
            await conn.execute(
                text(
                    """
                    select pattern_key
                    from internal.behavior_pattern_signatures
                    where event_id = cast(:event_id as uuid)
                    """
                ),
                {"event_id": event_id},
            )
        ).scalar_one_or_none()
        await conn.execute(
            text("select id from public.dogs where id = cast(:dog_id as uuid) for update"),
            {"dog_id": dog_id},
        )
        semantic_rows = (
            await conn.execute(
                text(
                    """
                    select distinct on (pattern_key) pattern_key, signal_signature
                    from internal.behavior_pattern_signatures
                    where dog_id = cast(:dog_id as uuid)
                    order by pattern_key, event_id desc
                    """
                ),
                {"dog_id": dog_id},
            )
        ).mappings().all()
        similar_key = _closest_pattern_key(
            signature,
            [
                (str(row["pattern_key"]), dict(row["signal_signature"] or {}))
                for row in semantic_rows
            ],
        )
        pattern_key = similar_key or pattern_key
        await conn.execute(
            text(
                """
                insert into internal.behavior_pattern_signatures (
                  event_id, dog_id, pattern_key, intent_code, context_bucket,
                  signal_signature, owner_context_signature
                ) values (
                  cast(:event_id as uuid), cast(:dog_id as uuid), :pattern_key,
                  :intent, :context_bucket, cast(:signature as jsonb),
                  cast(:owner_context as jsonb)
                )
                on conflict (event_id) do update set
                  pattern_key = excluded.pattern_key,
                  intent_code = excluded.intent_code,
                  context_bucket = excluded.context_bucket,
                  signal_signature = excluded.signal_signature,
                  owner_context_signature = excluded.owner_context_signature
                """
            ),
            {
                "event_id": event_id,
                "dog_id": dog_id,
                "pattern_key": pattern_key,
                "intent": intent,
                "context_bucket": context_bucket,
                "signature": json.dumps(signature),
                "owner_context": json.dumps(owner_context),
            },
        )
        support = (
            await conn.execute(
                text(
                    """
                    select count(distinct (
                      date_trunc('day', e.created_at)
                      + floor(extract(hour from e.created_at) / 6) * interval '6 hours'
                    ))::int as n
                    from internal.behavior_pattern_signatures s
                    join public.behavior_events e on e.id = s.event_id
                    where s.dog_id = cast(:dog_id as uuid)
                      and s.pattern_key = :pattern_key
                    """
                ),
                {"dog_id": dog_id, "pattern_key": pattern_key},
            )
        ).mappings().one()["n"]
        if previous_key and str(previous_key) != pattern_key:
            await conn.execute(
                text(
                    """
                    delete from internal.pattern_event_links l
                    using public.personal_patterns p
                    where l.pattern_id = p.id
                      and l.event_id = cast(:event_id as uuid)
                      and p.dog_id = cast(:dog_id as uuid)
                      and p.pattern_key = :old_key
                    """
                ),
                {"event_id": event_id, "dog_id": dog_id, "old_key": str(previous_key)},
            )
            await conn.execute(
                text(
                    """
                    update public.personal_patterns p
                    set support_count = counts.n,
                        state = case when counts.n < 2 then 'ARCHIVED' else p.state end,
                        version = p.version + 1,
                        updated_at = now()
                    from (
                      select count(distinct (
                        date_trunc('day', e.created_at)
                        + floor(extract(hour from e.created_at) / 6) * interval '6 hours'
                      ))::int as n
                      from internal.behavior_pattern_signatures s
                      join public.behavior_events e on e.id = s.event_id
                      where s.dog_id = cast(:dog_id as uuid)
                        and s.pattern_key = :old_key
                    ) counts
                    where p.dog_id = cast(:dog_id as uuid)
                      and p.pattern_key = :old_key
                    """
                ),
                {"dog_id": dog_id, "old_key": str(previous_key)},
            )
        if int(support) < 2:
            return
        feedback = (
            await conn.execute(
                text(
                    """
                    select
                      count(*) filter (where f.value = 'YES')::int as confirmations,
                      count(*) filter (where f.value = 'NO')::int as contradictions
                    from internal.behavior_pattern_signatures s
                    left join public.behavior_feedback f on f.event_id = s.event_id
                    where s.dog_id = cast(:dog_id as uuid)
                      and s.pattern_key = :pattern_key
                    """
                ),
                {"dog_id": dog_id, "pattern_key": pattern_key},
            )
        ).mappings().one()
        confirm = int(feedback["confirmations"])
        contradict = int(feedback["contradictions"])
        existing = (
            await conn.execute(
                text(
                    """
                    select id
                    from public.personal_patterns
                    where dog_id = cast(:dog_id as uuid)
                      and pattern_key = :pattern_key
                    for update
                    """
                ),
                {"dog_id": dog_id, "pattern_key": pattern_key},
            )
        ).mappings().first()
        state = derive_pattern_state(int(support), confirm)
        if state is None:
            return
        if contradict >= 2 and contradict > confirm:
            state = PatternState.CONTESTED
        if existing is None:
            inserted = (
                await conn.execute(
                    text(
                        """
                        insert into public.personal_patterns (
                          dog_id, title, state, support_count, confirm_count,
                          contradict_count, reliability_band, version,
                          first_seen, last_seen, pattern_key, intent_code,
                          context_bucket, signal_signature, owner_context_signature
                        ) values (
                          cast(:dog_id as uuid), :title, :state, :support, :confirm,
                          :contradict, :reliability, 1, now(), now(), :pattern_key,
                          :intent, :context_bucket, cast(:signature as jsonb),
                          cast(:owner_context as jsonb)
                        )
                        returning id
                        """
                    ),
                    {
                        "dog_id": dog_id,
                        "title": title,
                        "state": state.value,
                        "support": int(support),
                        "confirm": confirm,
                        "contradict": contradict,
                        "reliability": reliability_for(state).upper(),
                        "pattern_key": pattern_key,
                        "intent": intent,
                        "context_bucket": context_bucket,
                        "signature": json.dumps(signature),
                        "owner_context": json.dumps(owner_context),
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
                    set title = :title,
                        state = :state,
                        support_count = :support,
                        confirm_count = :confirm,
                        contradict_count = :contradict,
                        reliability_band = :reliability,
                        intent_code = :intent,
                        context_bucket = :context_bucket,
                        signal_signature = cast(:signature as jsonb),
                        owner_context_signature = cast(:owner_context as jsonb),
                        last_seen = now(),
                        version = version + 1,
                        updated_at = now()
                    where id = cast(:id as uuid)
                    """
                ),
                {
                    "id": pattern_id,
                    "title": title,
                    "state": state.value,
                    "support": int(support),
                    "confirm": confirm,
                    "contradict": contradict,
                    "reliability": reliability_for(state).upper(),
                    "intent": intent,
                    "context_bucket": context_bucket,
                    "signature": json.dumps(signature),
                    "owner_context": json.dumps(owner_context),
                },
            )
        await conn.execute(
            text(
                """
                insert into internal.pattern_event_links (
                  pattern_id, event_id, relation, similarity
                )
                select cast(:pattern_id as uuid), s.event_id, 'SUPPORT', 1
                from internal.behavior_pattern_signatures s
                where s.dog_id = cast(:dog_id as uuid)
                  and s.pattern_key = :pattern_key
                on conflict (pattern_id, event_id) do nothing
                """
            ),
            {
                "pattern_id": pattern_id,
                "dog_id": dog_id,
                "pattern_key": pattern_key,
            },
        )


async def recalculate_knowledge_score_db(engine: AsyncEngine, *, dog_id: str) -> None:
    async with engine.begin() as conn:
        stats = (
            await conn.execute(
                text(
                    """
                    with usable as (
                      select e.*, c.context_bucket, c.has_audio
                      from public.behavior_events e
                      join public.behavior_captures c on c.id = e.capture_id
                      where e.dog_id = cast(:dog_id as uuid)
                        and e.status = 'COMPLETED'
                        and e.primary_intent is not null
                        and e.primary_intent not in ('AMBIGUOUS', 'INSUFFICIENT')
                        and e.observation_json is not null
                    )
                    select
                      (select count(*) from usable)::int as usable_events,
                      (select count(distinct context_bucket) from usable
                        where context_bucket is not null
                          and context_bucket <> 'UNKNOWN'
                      )::int as context_count,
                      (select count(distinct created_at::date) from usable
                      )::int as active_days,
                      coalesce((
                        select avg(
                          case
                            when observation_json #>> '{capture_quality,overall_quality}' = 'good'
                              and (
                                not has_audio
                                or observation_json #>> '{capture_quality,audio_quality}' = 'good'
                              ) then 1.0
                            when observation_json #>> '{capture_quality,overall_quality}' = 'good'
                              then 0.75
                            else 0.5
                          end
                        ) from usable
                      ), 0)::float as modality_quality,
                      (select count(*) from public.behavior_feedback f
                        join usable e on e.id = f.event_id
                        where f.value in ('YES', 'NO')
                      )::int as decisive_feedback,
                      coalesce((select sum(support_count)
                        from public.personal_patterns
                        where dog_id = cast(:dog_id as uuid)), 0)::int as pattern_support,
                      coalesce((select sum(contradict_count)
                        from public.personal_patterns
                        where dog_id = cast(:dog_id as uuid)), 0)::int
                        as pattern_contradictions
                    """
                ),
                {"dog_id": dog_id},
            )
        ).mappings().one()
    support = int(stats["pattern_support"])
    contradictions = int(stats["pattern_contradictions"])
    consistency = max(support - contradictions, 0) / support if support else 0.0
    maturity = min(support / 8, 1.0)
    components = {
        "usable_volume": round(min(int(stats["usable_events"]) / 20, 1.0) * 0.25, 3),
        "context_diversity": round(min(int(stats["context_count"]) / 6, 1.0) * 0.20, 3),
        "temporal_diversity": round(min(int(stats["active_days"]) / 12, 1.0) * 0.15, 3),
        "modality_quality": round(float(stats["modality_quality"]) * 0.15, 3),
        "pattern_consistency": round(consistency * maturity * 0.15, 3),
        "owner_validation": round(
            min(int(stats["decisive_feedback"]) / 10, 1.0) * 0.10,
            3,
        ),
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
