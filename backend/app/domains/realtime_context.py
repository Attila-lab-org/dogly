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
    owner_display_name: str | None = None
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
                    select d.id, d.name, d.sex, d.birth_date, d.age_stage,
                           d.size, d.breed_label, d.is_mix, d.weight_kg,
                           p.display_name
                    from public.dogs d
                    left join public.profiles p on p.user_id=d.owner_id
                    where d.id=cast(:dog_id as uuid)
                      and d.owner_id=cast(:user_id as uuid)
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
        if key not in {"id", "name", "display_name"} and value is not None
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
        owner_display_name=(
            str(dog["display_name"]) if dog.get("display_name") else None
        ),
        identity=identity,
        stable_facts=stable_facts[:10],
        items=sorted(
            items,
            key=lambda item: item.occurred_at or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )[:12],
        missing=missing,
    )


_AGE_LABEL = {
    "PUPPY": "cucciolo",
    "JUNIOR": "giovane",
    "ADULT": "adulto",
    "SENIOR": "anziano",
}
_SEX_LABEL = {"MALE": "maschio", "FEMALE": "femmina"}
_SOURCE_LABEL = {
    "BEHAVIOR_EVENT": "Lettura comportamentale",
    "DIGESTIVE_EVENT": "Lettura digestiva",
    "PERSONAL_PATTERN": "Abitudine già consolidata",
    "FEEDING_PERIOD": "Alimentazione",
    "CARE_EVENT": "Cura",
}
_MISSING_LABEL = {
    "active_feeding": "alimentazione attiva",
    "weight": "peso attuale",
    "confirmed_routine": "routine confermata",
}


def render_voice_brief(context: RealtimeDogContext, *, welcome: str) -> str:
    """Compact spoken context. The voice model talks from this, not from tools."""
    owner = (context.owner_display_name or "").strip().split(" ", 1)[0]
    profile: list[str] = []
    breed = context.identity.get("breed_label")
    if breed:
        profile.append(str(breed))
    age = _AGE_LABEL.get(str(context.identity.get("age_stage") or ""), "")
    if age:
        profile.append(age)
    sex = _SEX_LABEL.get(str(context.identity.get("sex") or ""), "")
    if sex:
        profile.append(sex)
    known: list[str] = []
    for fact in context.stable_facts[:6]:
        statement = fact.get("statement") or (
            f"{fact.get('key')}: {fact.get('value')}" if fact.get("key") else None
        )
        if statement:
            known.append(f"- {statement}")
    events: list[str] = []
    for item in context.items[:8]:
        label = _SOURCE_LABEL.get(item.source_type, "Nota")
        headline = item.data.get("headline") if item.data else None
        when = (
            item.occurred_at.strftime("%d/%m")
            if item.occurred_at
            else ""
        )
        prefix = f"{label} {when}".strip()
        events.append(f"- {prefix}: {headline or item.summary}")
    missing = [
        _MISSING_LABEL.get(key, key) for key in context.missing if key in _MISSING_LABEL
    ]
    return "\n".join(
        [
            f"Sei DOGly, la voce che conosce {context.dog_name}.",
            "Parli in italiano come una persona competente che ha già il cane davanti.",
            "Questa è una conversazione vocale in tempo reale: rispondi SUBITO.",
            "Non pensare ad alta voce. Non dire un attimo, sto pensando, vedo, elaboro.",
            "2-4 frasi corte, calde, utili. Al massimo una domanda, solo se cambia cosa fare.",
            "Usa soltanto i fatti sotto. Non inventare eventi, diagnosi, emozioni o ricordi.",
            "Distingui ciò che DOGly ha visto, ciò che ha detto il proprietario e ciò che è un'abitudine consolidata.",
            "Salute: niente diagnosi. Spiega cosa osservare e quando è prudente sentire il veterinario.",
            "Se per capire un comportamento di adesso serve vederlo, chiedi un video breve.",
            "Se non respira, collassa, ha convulsioni, può aver ingerito veleno o perde molto sangue, di' subito di chiamare un pronto soccorso veterinario.",
            f"All'avvio saluta UNA volta sola con: {welcome}",
            f"Proprietario: {owner or 'non indicato'}. Cane: {context.dog_name}.",
            f"Profilo: {', '.join(profile) if profile else 'ancora essenziale'}.",
            "Fatti confermati dal proprietario:",
            "\n".join(known) if known else "- nessuno ancora",
            "Ultime letture DOGly:",
            "\n".join(events) if events else "- nessuna analisi ancora",
            f"Non hai ancora: {', '.join(missing)}." if missing else "Il profilo essenziale è presente.",
        ]
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
        owner_display_name=getattr(store.profiles.get(dog.owner_id), "display_name", None),
        identity={
            "sex": dog.sex,
            "age_stage": dog.age_stage,
            "size": dog.size,
            "breed_label": dog.breed_label,
        },
        missing=["active_feeding", "confirmed_routine"],
    )
