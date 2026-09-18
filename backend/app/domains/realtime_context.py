"""Bounded cross-domain context for one DOGly conversation turn."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.realtime import RealtimeDomain
from app.domains.repository import InMemoryStore

REALTIME_CONTEXT_VERSION = "personal-dog-context/v1"


class RealtimeContextItem(BaseModel):
    source_id: str
    source_type: str
    occurred_at: datetime | None = None
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)


class RealtimeDogContext(BaseModel):
    version: str = REALTIME_CONTEXT_VERSION
    dog_id: str
    dog_name: str
    identity: dict[str, Any]
    stable_facts: list[dict[str, Any]] = Field(default_factory=list)
    items: list[RealtimeContextItem] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)

    def source_refs(self) -> list[dict[str, str]]:
        return [
            {"source_id": item.source_id, "source_type": item.source_type}
            for item in self.items
        ]


_DIGESTIVE_WORDS = {
    "cacca", "feci", "diarrea", "intestino", "digestione", "vomito", "vomitato",
}
_NUTRITION_WORDS = {
    "cibo", "mangia", "mangiato", "alimento", "dose", "quantità", "peso", "snack",
}
_BEHAVIOR_WORDS = {
    "fa", "comportamento", "abbaia", "ringhia", "agitato", "irrequieto", "paura",
    "guarda", "gira", "dorme", "riposa", "video",
}
_CARE_WORDS = {"veterinario", "visita", "vaccino", "farmaco", "terapia", "appuntamento"}


def route_realtime_domains(user_text: str) -> list[RealtimeDomain]:
    words = {part.strip(".,!?;:()").lower() for part in user_text.split()}
    domains: list[RealtimeDomain] = []
    if words & _DIGESTIVE_WORDS:
        domains.append("DIGESTIVE")
    if words & _NUTRITION_WORDS:
        domains.append("NUTRITION")
    if words & _BEHAVIOR_WORDS:
        domains.append("BEHAVIOR")
    if words & _CARE_WORDS:
        domains.append("CARE")
    return domains[:3] or ["GENERAL"]


async def load_realtime_context_db(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    domains: list[RealtimeDomain],
) -> RealtimeDogContext:
    async with engine.connect() as conn:
        dog = (
            await conn.execute(
                text(
                    """
                    select id, name, sex, birth_date, age_stage, size, breed_label,
                           is_mix, weight_kg
                    from public.dogs
                    where id=cast(:dog_id as uuid)
                      and owner_id=cast(:user_id as uuid)
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().one_or_none()
        if dog is None:
            raise LookupError("Dog not found")

        lifestyle = (
            await conn.execute(
                text(
                    """
                    select routine_json, preferences_json, provenance_json,
                           last_confirmed_at
                    from public.dog_lifestyle_profiles
                    where dog_id=cast(:dog_id as uuid)
                      and user_id=cast(:user_id as uuid)
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().one_or_none()
        stories = (
            await conn.execute(
                text(
                    """
                    select id, facts_json, confirmed_at
                    from public.owner_reported_observations
                    where dog_id=cast(:dog_id as uuid)
                      and user_id=cast(:user_id as uuid)
                      and status='CONFIRMED'
                    order by confirmed_at desc
                    limit 4
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()

        items: list[RealtimeContextItem] = []
        if "BEHAVIOR" in domains or "GENERAL" in domains:
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
                    RealtimeContextItem(
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
                               context_bucket, support_count, confirm_count
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
                    RealtimeContextItem(
                        source_id=str(row["id"]),
                        source_type="PERSONAL_PATTERN",
                        summary=str(row["title"]),
                        data=dict(row),
                    )
                )

        if "DIGESTIVE" in domains or "NUTRITION" in domains or "GENERAL" in domains:
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
                    RealtimeContextItem(
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

        if "NUTRITION" in domains or "DIGESTIVE" in domains or "GENERAL" in domains:
            feeding = (
                await conn.execute(
                    text(
                        """
                        select fp.id, fp.quantity_per_day, fp.start_at,
                               fp.treats_notes, food.id food_id, food.name,
                               food.brand, food.verified_at
                        from public.feeding_periods fp
                        join public.food_products food on food.id=fp.food_product_id
                        where fp.dog_id=cast(:dog_id as uuid)
                          and fp.start_at <= now()
                          and (fp.end_at is null or fp.end_at >= now())
                          and food.verified_at is not null
                        order by fp.start_at desc
                        limit 1
                        """
                    ),
                    {"dog_id": dog_id},
                )
            ).mappings().one_or_none()
            if feeding:
                items.append(
                    RealtimeContextItem(
                        source_id=str(feeding["id"]),
                        source_type="FEEDING_PERIOD",
                        occurred_at=feeding["start_at"],
                        summary=f"Alimentazione attiva: {feeding['name']}",
                        data=dict(feeding),
                    )
                )

        if "CARE" in domains or "GENERAL" in domains:
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
                    RealtimeContextItem(
                        source_id=str(row["id"]),
                        source_type="CARE_EVENT",
                        occurred_at=row["scheduled_at"],
                        summary=str(row["title"]),
                        data=dict(row),
                    )
                )

    stable_facts: list[dict[str, Any]] = []
    if lifestyle:
        for bucket in ("routine_json", "preferences_json"):
            for key, value in dict(lifestyle[bucket] or {}).items():
                if value is not None:
                    stable_facts.append(
                        {
                            "key": key,
                            "value": value,
                            "origin": "OWNER_REPORTED",
                            "verification_status": (
                                "CONFIRMED" if lifestyle["last_confirmed_at"] else "UNCONFIRMED"
                            ),
                        }
                    )
    for story in stories:
        for fact in list(story["facts_json"] or [])[:4]:
            stable_facts.append(
                {
                    **dict(fact),
                    "origin": "OWNER_REPORTED",
                    "verification_status": "CONFIRMED",
                    "source_id": str(story["id"]),
                }
            )

    identity = {
        key: value
        for key, value in dict(dog).items()
        if key not in {"id", "name"} and value is not None
    }
    missing: list[str] = []
    if not any(item.source_type == "FEEDING_PERIOD" for item in items):
        missing.append("active_feeding")
    if dog.get("weight_kg") is None:
        missing.append("weight")
    if not stable_facts:
        missing.append("confirmed_routine")
    return RealtimeDogContext(
        dog_id=str(dog["id"]),
        dog_name=str(dog["name"]),
        identity=identity,
        stable_facts=stable_facts[:10],
        items=sorted(
            items,
            key=lambda item: item.occurred_at or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )[:12],
        missing=missing,
    )


def load_realtime_context_memory(
    store: InMemoryStore,
    *,
    dog_id: str,
    domains: list[RealtimeDomain],
) -> RealtimeDogContext:
    dog = store.dogs[dog_id]
    return RealtimeDogContext(
        dog_id=dog.id,
        dog_name=dog.name,
        identity={
            "sex": dog.sex,
            "age_stage": dog.age_stage,
            "size": dog.size,
            "breed_label": dog.breed_label,
        },
        missing=["active_feeding", "confirmed_routine"],
    )
