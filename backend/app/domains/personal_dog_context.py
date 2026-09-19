"""Read-only assembler for PersonalDogContext (unified Canine Intelligence).

Reuses profile, lifestyle, owner stories, patterns, and specialist consumer
results. Does not own writes or create a parallel memory store.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.canine_intelligence import (
    CanineDomain,
    CanineEvidenceItem,
    PersonalDogContext,
    PersonalFact,
)
from app.contracts.provenance import PROVENANCE_OWNER_LABEL, normalize_provenance
from app.contracts.realtime import RealtimeDomain
from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec
from app.domains.repository import InMemoryStore
from app.knowledge.models import DogContextSnapshot, LifestyleFact
from app.providers.base import EligiblePatternSummary

PERSONAL_DOG_CONTEXT_VERSION = "personal-dog-context/v2"

_SOURCE_DOMAIN: dict[str, CanineDomain] = {
    "BEHAVIOR_EVENT": "BEHAVIOR",
    "PERSONAL_PATTERN": "BEHAVIOR",
    "DIGESTIVE_EVENT": "DIGESTIVE",
    "FEEDING_PERIOD": "NUTRITION",
    "FOOD_PRODUCT": "NUTRITION",
    "CARE_EVENT": "CARE",
    "WEIGHT": "CARE",
}


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def merge_owner_stories_into_context(
    context: DogContextSnapshot,
    stories: list[dict[str, Any]],
) -> DogContextSnapshot:
    """Fold confirmed owner stories into the lifestyle snapshot (Behavior path)."""
    routine = dict(context.routine)
    extras: dict[str, list[LifestyleFact]] = {
        "preferences": list(context.preferences),
        "health_context": list(context.health_context),
        "recent_changes": list(context.recent_changes),
        "owner_reported": list(context.owner_reported),
    }
    for story in stories:
        facts = story.get("facts") or story.get("facts_json") or []
        if isinstance(facts, str):
            facts = json.loads(facts)
        confirmed_at = _as_datetime(story.get("confirmed_at"))
        story_id = str(story.get("id") or "")
        for fact in facts:
            if not isinstance(fact, dict):
                continue
            statement = str(fact.get("statement") or "").strip()
            if not statement:
                continue
            category = str(fact.get("category") or "GENERAL")
            item = LifestyleFact(
                key=f"owner_{category.lower()}",
                value=statement,
                provenance="OWNER_CONFIRMED",
                last_confirmed_at=confirmed_at,
            )
            if category == "PREFERENCE":
                extras["preferences"].append(item)
            elif category in {"HEALTH", "DIET"}:
                extras["health_context"].append(item)
            elif category == "ROUTINE":
                fact_id = str(fact.get("id") or story_id or len(routine))
                routine[f"owner_{fact_id}"] = item
            else:
                extras["owner_reported"].append(item)
    return context.model_copy(update={**extras, "routine": routine})


def _personal_facts_from_context(
    context: DogContextSnapshot,
    *,
    stories: list[dict[str, Any]] | None = None,
) -> list[PersonalFact]:
    facts: list[PersonalFact] = []
    seen: set[tuple[str, str]] = set()

    def _add(
        key: str,
        value: Any,
        provenance: str,
        *,
        domain: CanineDomain = "PROFILE",
        last_confirmed_at: datetime | None = None,
        source_id: str | None = None,
    ) -> None:
        fingerprint = (key, str(value))
        if fingerprint in seen:
            return
        seen.add(fingerprint)
        facts.append(
            PersonalFact(
                key=key,
                value=value,
                provenance=normalize_provenance(provenance),
                domain=domain,
                last_confirmed_at=last_confirmed_at,
                source_id=source_id,
            )
        )

    for bucket_name in (
        "today_vs_usual",
        "recent_changes",
        "preferences",
        "health_context",
        "owner_reported",
    ):
        for item in getattr(context, bucket_name):
            domain: CanineDomain = (
                "NUTRITION"
                if item.key.startswith("owner_diet") or "food" in item.key.lower()
                else "CARE"
                if bucket_name == "health_context"
                else "PROFILE"
            )
            _add(
                item.key,
                item.value,
                item.provenance,
                domain=domain,
                last_confirmed_at=item.last_confirmed_at,
            )
    for key, item in context.routine.items():
        if item is None:
            continue
        _add(
            key,
            item.value,
            item.provenance,
            domain="PROFILE",
            last_confirmed_at=item.last_confirmed_at,
        )

    for story in stories or []:
        story_id = str(story.get("id") or "")
        confirmed_at = _as_datetime(story.get("confirmed_at"))
        raw_facts = story.get("facts") or story.get("facts_json") or []
        if isinstance(raw_facts, str):
            raw_facts = json.loads(raw_facts)
        for fact in raw_facts:
            if not isinstance(fact, dict):
                continue
            statement = str(fact.get("statement") or "").strip()
            if not statement:
                continue
            category = str(fact.get("category") or "GENERAL").lower()
            _add(
                f"owner_{category}",
                statement,
                "OWNER_CONFIRMED",
                domain="PROFILE",
                last_confirmed_at=confirmed_at,
                source_id=story_id or None,
            )
    return facts


def _evidence_item(
    *,
    source_id: str,
    source_type: str,
    summary: str,
    occurred_at: datetime | None = None,
    data: dict[str, Any] | None = None,
    provenance: str = "OBSERVED",
    verification: str = "VERIFIED",
) -> CanineEvidenceItem:
    return CanineEvidenceItem(
        evidence_id=f"{source_type.lower()}:{source_id}",
        domain=_SOURCE_DOMAIN.get(source_type, "GENERAL"),
        source_type=source_type,
        source_id=source_id,
        occurred_at=occurred_at,
        provenance=normalize_provenance(provenance),
        verification=verification,  # type: ignore[arg-type]
        summary=summary,
        data=data or {},
    )


def _identity_from_dog(dog: DogRec | dict[str, Any]) -> dict[str, Any]:
    payload = dog.model_dump() if isinstance(dog, DogRec) else dict(dog)
    return {
        key: value
        for key, value in payload.items()
        if key
        not in {"id", "name", "owner_id", "created_at", "deleted_at", "display_name"}
        and value is not None
    }


def _missing_from(
    *,
    evidence: list[CanineEvidenceItem],
    personal_facts: list[PersonalFact],
    identity: dict[str, Any],
) -> list[str]:
    missing: list[str] = []
    if not any(
        item.source_type in {"FEEDING_PERIOD", "FOOD_PRODUCT"} for item in evidence
    ):
        missing.append("active_feeding")
    if identity.get("weight_kg") is None:
        missing.append("weight")
    if not personal_facts:
        missing.append("confirmed_routine")
    return missing


def build_personal_dog_context(
    *,
    dog: DogRec,
    dog_context: DogContextSnapshot,
    lifestyle_dump: dict[str, Any] | None = None,
    stories: list[dict[str, Any]] | None = None,
    eligible_patterns: list[EligiblePatternSummary] | None = None,
    evidence: list[CanineEvidenceItem] | None = None,
    owner_display_name: str | None = None,
) -> PersonalDogContext:
    """Pure assembly from already-loaded sources (no I/O)."""
    del lifestyle_dump
    merged = merge_owner_stories_into_context(dog_context, stories or [])
    facts = _personal_facts_from_context(merged, stories=stories)
    items = list(evidence or [])
    identity = _identity_from_dog(dog)
    return PersonalDogContext(
        version=PERSONAL_DOG_CONTEXT_VERSION,
        dog_id=dog.id,
        dog_name=dog.name,
        owner_display_name=owner_display_name or merged.owner_display_name,
        identity=identity,
        dog_context=merged,
        personal_facts=facts,
        eligible_patterns=list(eligible_patterns or [])[:8],
        evidence=items,
        missing=_missing_from(
            evidence=items, personal_facts=facts, identity=identity
        ),
    )


async def load_cross_domain_evidence_db(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    domains: list[RealtimeDomain] | list[str] | None = None,
) -> list[CanineEvidenceItem]:
    """Project specialist consumer results into typed evidence items."""
    selected = set(domains or ["GENERAL"])
    want_all = "GENERAL" in selected
    items: list[CanineEvidenceItem] = []

    async with engine.connect() as conn:
        if want_all or "BEHAVIOR" in selected:
            rows = (
                await conn.execute(
                    text(
                        """
                        select id, created_at, primary_intent, confidence_band,
                               interpretation_json, summary
                        from public.behavior_events
                        where dog_id=cast(:dog_id as uuid)
                          and user_id=cast(:user_id as uuid)
                          and status='COMPLETED'
                        order by created_at desc
                        limit 4
                        """
                    ),
                    {"dog_id": dog_id, "user_id": user_id},
                )
            ).mappings().all()
            for row in rows:
                interpretation = dict(row["interpretation_json"] or {})
                consumer = dict(interpretation.get("consumer") or {})
                items.append(
                    _evidence_item(
                        source_id=str(row["id"]),
                        source_type="BEHAVIOR_EVENT",
                        occurred_at=row["created_at"],
                        summary=str(
                            interpretation.get("consumer_summary")
                            or consumer.get("consumer_summary")
                            or row["summary"]
                            or "Analisi comportamentale completata"
                        ),
                        data={
                            "headline": interpretation.get("consumer_headline")
                            or consumer.get("consumer_headline"),
                            "intent": row["primary_intent"],
                            "confidence": row["confidence_band"],
                            "evidence": interpretation.get("evidence", [])[:4],
                        },
                    )
                )
            patterns = (
                await conn.execute(
                    text(
                        """
                        select id, title, state, reliability_band, intent_code,
                               context_bucket, support_count, confirm_count,
                               last_seen
                        from public.personal_patterns
                        where dog_id=cast(:dog_id as uuid)
                          and state in ('PRELIMINARY','ESTABLISHED','STRONG')
                        order by last_seen desc
                        limit 2
                        """
                    ),
                    {"dog_id": dog_id},
                )
            ).mappings().all()
            for row in patterns:
                items.append(
                    _evidence_item(
                        source_id=str(row["id"]),
                        source_type="PERSONAL_PATTERN",
                        occurred_at=row.get("last_seen"),
                        summary=str(row["title"]),
                        data=dict(row),
                        provenance="ESTABLISHED_PATTERN",
                    )
                )

        if want_all or "DIGESTIVE" in selected or "NUTRITION" in selected:
            rows = (
                await conn.execute(
                    text(
                        """
                        select id, created_at, consistency, fecal_score_estimate,
                               intelligence_json, owner_context_json
                        from public.fecal_events
                        where dog_id=cast(:dog_id as uuid)
                          and user_id=cast(:user_id as uuid)
                          and status='COMPLETED'
                        order by created_at desc
                        limit 4
                        """
                    ),
                    {"dog_id": dog_id, "user_id": user_id},
                )
            ).mappings().all()
            for row in rows:
                intelligence = dict(row["intelligence_json"] or {})
                items.append(
                    _evidence_item(
                        source_id=str(row["id"]),
                        source_type="DIGESTIVE_EVENT",
                        occurred_at=row["created_at"],
                        summary=str(
                            intelligence.get("consumer_summary")
                            or "Analisi digestiva completata"
                        ),
                        data={
                            "headline": intelligence.get("consumer_headline"),
                            "state": intelligence.get("overall_state"),
                            "consistency": row["consistency"],
                            "next_step": intelligence.get("recommended_next_step"),
                            "owner_context": row["owner_context_json"] or {},
                        },
                    )
                )

        if want_all or "NUTRITION" in selected or "DIGESTIVE" in selected:
            feedings = (
                await conn.execute(
                    text(
                        """
                        select fp.id, fp.quantity_per_day, fp.start_at, fp.end_at,
                               fp.treats_notes, food.id food_id, food.name,
                               food.brand, food.verified_at, food.feeding_directions
                        from public.feeding_periods fp
                        join public.food_products food on food.id=fp.food_product_id
                        where fp.dog_id=cast(:dog_id as uuid)
                        order by fp.end_at is null desc, fp.start_at desc
                        limit 3
                        """
                    ),
                    {"dog_id": dog_id},
                )
            ).mappings().all()
            linked_food_ids: set[str] = set()
            for feeding in feedings:
                linked_food_ids.add(str(feeding["food_id"]))
                active = feeding["end_at"] is None
                name = feeding["name"] or feeding["brand"] or "cibo"
                verified = feeding["verified_at"] is not None
                items.append(
                    _evidence_item(
                        source_id=str(feeding["id"]),
                        source_type="FEEDING_PERIOD",
                        occurred_at=feeding["start_at"],
                        summary=(
                            f"{'Alimentazione attiva' if active else 'Cibo precedente'}: {name}"
                        ),
                        data=dict(feeding),
                        provenance=(
                            "OWNER_CONFIRMED" if verified else "OWNER_REPORTED"
                        ),
                        verification=(
                            "VERIFIED" if verified else "OWNER_CONFIRMED"
                        ),
                    )
                )
            foods = (
                await conn.execute(
                    text(
                        """
                        select id, name, brand, verified_at, ingredients_raw,
                               feeding_directions, created_at
                        from public.food_products
                        where dog_id=cast(:dog_id as uuid)
                           or (dog_id is null and owner_id=cast(:user_id as uuid))
                        order by verified_at desc nulls last, created_at desc
                        limit 4
                        """
                    ),
                    {"dog_id": dog_id, "user_id": user_id},
                )
            ).mappings().all()
            for food in foods:
                if str(food["id"]) in linked_food_ids:
                    continue
                name = food["name"] or food["brand"] or "cibo scansionato"
                verified = food["verified_at"] is not None
                items.append(
                    _evidence_item(
                        source_id=str(food["id"]),
                        source_type="FOOD_PRODUCT",
                        occurred_at=food["created_at"],
                        summary=(
                            f"{'Cibo' if verified else 'Cibo da confermare'}: {name}"
                        ),
                        data={
                            "name": food["name"],
                            "brand": food["brand"],
                            "verified": verified,
                            "directions": food["feeding_directions"],
                        },
                        provenance=(
                            "OWNER_CONFIRMED" if verified else "OWNER_REPORTED"
                        ),
                        verification="VERIFIED" if verified else "UNVERIFIED",
                    )
                )

        if want_all or "CARE" in selected:
            care = (
                await conn.execute(
                    text(
                        """
                        select id, event_type, title, scheduled_at, status, notes
                        from public.care_events
                        where dog_id=cast(:dog_id as uuid)
                          and user_id=cast(:user_id as uuid)
                          and scheduled_at >= now() - interval '30 days'
                        order by scheduled_at desc
                        limit 4
                        """
                    ),
                    {"dog_id": dog_id, "user_id": user_id},
                )
            ).mappings().all()
            for row in care:
                items.append(
                    _evidence_item(
                        source_id=str(row["id"]),
                        source_type="CARE_EVENT",
                        occurred_at=row["scheduled_at"],
                        summary=str(row["title"]),
                        data=dict(row),
                        provenance="OWNER_REPORTED",
                        verification="OWNER_CONFIRMED",
                    )
                )

    items.sort(
        key=lambda item: item.occurred_at or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return items[:16]


def load_cross_domain_evidence_memory(
    store: InMemoryStore,
    *,
    dog_id: str,
    domains: list[RealtimeDomain] | list[str] | None = None,
) -> list[CanineEvidenceItem]:
    selected = set(domains or ["GENERAL"])
    want_all = "GENERAL" in selected
    dog = store.dogs[dog_id]
    items: list[CanineEvidenceItem] = []

    if want_all or "NUTRITION" in selected or "DIGESTIVE" in selected:
        for food in store.food_products.values():
            if food.dog_id != dog_id and food.owner_id != dog.owner_id:
                continue
            items.append(
                _evidence_item(
                    source_id=food.id,
                    source_type="FOOD_PRODUCT",
                    occurred_at=food.created_at,
                    summary=f"Cibo: {food.name or food.brand or 'scansionato'}",
                    data={"name": food.name, "brand": food.brand},
                    provenance="OWNER_REPORTED",
                    verification="UNVERIFIED",
                )
            )
        for period in store.feeding_periods.values():
            if period.dog_id != dog_id:
                continue
            food = store.food_products.get(period.food_product_id)
            items.append(
                _evidence_item(
                    source_id=period.id,
                    source_type="FEEDING_PERIOD",
                    occurred_at=period.start_at,
                    summary=(
                        f"Alimentazione attiva: "
                        f"{getattr(food, 'name', None) or 'cibo'}"
                    ),
                    data={"quantity_per_day": period.quantity_per_day},
                    provenance="OWNER_CONFIRMED",
                    verification="OWNER_CONFIRMED",
                )
            )

    if want_all or "BEHAVIOR" in selected:
        for event in store.behavior_events.values():
            if event.dog_id != dog_id:
                continue
            status = getattr(event.status, "value", event.status)
            if status != "COMPLETED":
                continue
            interpretation = dict(event.interpretation_json or {})
            consumer = dict(interpretation.get("consumer") or {})
            items.append(
                _evidence_item(
                    source_id=event.id,
                    source_type="BEHAVIOR_EVENT",
                    occurred_at=event.created_at,
                    summary=str(
                        interpretation.get("consumer_summary")
                        or consumer.get("consumer_summary")
                        or event.summary
                        or "Analisi comportamentale completata"
                    ),
                    data={
                        "headline": interpretation.get("consumer_headline")
                        or consumer.get("consumer_headline"),
                        "intent": event.primary_intent,
                    },
                )
            )

    if want_all or "DIGESTIVE" in selected:
        for event in store.fecal_events.values():
            if event.dog_id != dog_id:
                continue
            status = getattr(event.status, "value", event.status)
            if status != "COMPLETED":
                continue
            intelligence = dict(getattr(event, "intelligence_json", None) or {})
            items.append(
                _evidence_item(
                    source_id=event.id,
                    source_type="DIGESTIVE_EVENT",
                    occurred_at=event.created_at,
                    summary=str(
                        intelligence.get("consumer_summary")
                        or "Analisi digestiva completata"
                    ),
                    data={
                        "headline": intelligence.get("consumer_headline"),
                        "consistency": getattr(event, "consistency", None),
                    },
                )
            )

    items.sort(
        key=lambda item: item.occurred_at or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return items[:16]


def personal_to_realtime_items(personal: PersonalDogContext) -> list[dict[str, Any]]:
    """Adapter projection used by RealtimeDogContext.items."""
    return [
        {
            "source_id": item.source_id,
            "source_type": item.source_type,
            "occurred_at": item.occurred_at,
            "summary": item.summary,
            "data": {
                **item.data,
                "provenance": item.provenance,
                "verification": item.verification,
                "owner_label": PROVENANCE_OWNER_LABEL[item.provenance],
            },
        }
        for item in personal.evidence
    ]


def personal_to_stable_facts(personal: PersonalDogContext) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    for fact in personal.personal_facts[:10]:
        facts.append(
            {
                "key": fact.key,
                "value": fact.value,
                "statement": fact.value if isinstance(fact.value, str) else None,
                "origin": fact.provenance,
                "provenance": fact.provenance,
                "verification_status": (
                    "CONFIRMED"
                    if fact.provenance
                    in {"OWNER_CONFIRMED", "OBSERVED", "ESTABLISHED_PATTERN"}
                    else "UNCONFIRMED"
                ),
                "source_id": fact.source_id,
                "owner_label": PROVENANCE_OWNER_LABEL[fact.provenance],
            }
        )
    return facts


def assemble_behavior_dog_context(
    dog: DogRec,
    lifestyle_dump: dict[str, Any],
    stories: list[dict[str, Any]],
    *,
    owner_display_name: str | None = None,
    eligible_patterns: list[EligiblePatternSummary] | None = None,
    evidence: list[CanineEvidenceItem] | None = None,
) -> tuple[DogContextSnapshot, PersonalDogContext]:
    """Shared Behavior path: same merge order, typed personal context alongside."""
    base = build_dog_context(
        dog, lifestyle_dump, owner_display_name=owner_display_name
    )
    personal = build_personal_dog_context(
        dog=dog,
        dog_context=base,
        lifestyle_dump=lifestyle_dump,
        stories=stories,
        eligible_patterns=eligible_patterns,
        evidence=evidence,
        owner_display_name=owner_display_name,
    )
    return personal.dog_context, personal
