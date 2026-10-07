"""Bounded cross-domain context for one DOGly conversation turn."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.realtime import RealtimeDomain
from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec
from app.domains.personal_dog_context import (
    build_personal_dog_context,
    context_tokens,
    load_cross_domain_evidence_db,
    load_cross_domain_evidence_memory,
    personal_to_core_facts,
    personal_to_realtime_items,
    personal_to_stable_facts,
)
from app.domains.repository import InMemoryStore

REALTIME_CONTEXT_VERSION = "personal-dog-context/v2"


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
    # Core personale del cane: sempre disponibile al reasoner, senza retrieval
    # lessicale. Le evidenze restano invece selezionate per pertinenza.
    core_facts: list[dict[str, Any]] = Field(default_factory=list)
    stable_facts: list[dict[str, Any]] = Field(default_factory=list)
    items: list[RealtimeContextItem] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)

    def source_refs(self) -> list[dict[str, str]]:
        return [
            {"source_id": item.source_id, "source_type": item.source_type}
            for item in self.items
        ]


def focus_behavior_event(context: RealtimeDogContext, event: Any) -> None:
    """Put the exact owner-owned analysis in front of the conversation context."""
    if str(event.dog_id) != context.dog_id:
        raise LookupError("Behavior event does not belong to this dog")
    context.items.insert(
        0,
        RealtimeContextItem(
            source_id=str(event.id),
            source_type="BEHAVIOR_EVENT",
            occurred_at=event.completed_at or event.created_at,
            summary=str(event.summary or "Analisi comportamentale selezionata"),
            data={
                "status": str(event.status),
                "interpretation": dict(event.interpretation_json or {}),
                "advice": dict(event.advice_json or {}),
            },
        ),
    )
    context.items = context.items[:12]


def focus_digestive_event(context: RealtimeDogContext, event: Any) -> None:
    """Put the exact digestive analysis in front of the free conversation."""
    if str(event.dog_id) != context.dog_id:
        raise LookupError("Digestive event does not belong to this dog")
    context.items.insert(
        0,
        RealtimeContextItem(
            source_id=str(event.id),
            source_type="DIGESTIVE_EVENT",
            occurred_at=event.completed_at or event.created_at,
            summary=str(event.summary or "Analisi digestiva selezionata"),
            data={
                "status": str(event.status),
                "intelligence": dict(event.intelligence_json or {}),
                "owner_context": dict(event.owner_context_json or {}),
                "consistency": event.consistency,
                "fecal_score": event.fecal_score_estimate,
            },
        ),
    )
    context.items = context.items[:12]


_DIGESTIVE_WORDS = {
    "cacca", "feci", "diarrea", "intestino", "digestione", "vomito", "vomitato",
}
_NUTRITION_WORDS = {
    "cibo", "mangia", "mangiato", "alimento", "dose", "quantità", "peso", "snack",
}
_BEHAVIOR_WORDS = {
    "comportamento", "abbaia", "ringhia", "agitato", "irrequieto", "paura",
    "dorme", "riposa", "video", "coccole", "pelo", "zampa", "morde",
}
_CARE_WORDS = {"veterinario", "visita", "vaccino", "farmaco", "terapia", "appuntamento"}


_RESUME_GREETING = re.compile(
    r"^\s*(ciao|salve|buongiorno|buonasera|ehi|hey|ciao dogly)[!.?\s]*$",
    re.IGNORECASE,
)

_GENERIC_STARTER_QUESTIONS = {
    "perché oggi si comporta così?",
    "come posso aiutarlo a stare più tranquillo?",
    "cosa dovrei osservare nei prossimi giorni?",
    "che cosa sta cercando di comunicarmi?",
    "come capisco se per lui è una situazione nuova?",
    "qual è il modo migliore per accompagnarlo?",
    "cosa posso fare oggi per aiutarlo?",
    "come posso leggere meglio questo comportamento?",
    "quando conviene chiedere un aiuto in più?",
    "ti racconto una cosa successa oggi",
    "ti racconto cosa è successo oggi",
    "ti racconto cos'è successo oggi",
    "c’è un comportamento che voglio capire",
    "c'e un comportamento che voglio capire",
    "riprendiamo da lì",
    "riprendiamo da li",
    "parliamo di oggi",
}


def conversation_topic(user_texts: list[str], *, dog_name: str) -> str:
    meaningful: list[str] = []
    for line in reversed(user_texts):
        cleaned = " ".join((line or "").split())
        if not cleaned or _RESUME_GREETING.fullmatch(cleaned):
            continue
        if cleaned.casefold() in _GENERIC_STARTER_QUESTIONS:
            continue
        meaningful.append(cleaned)
        if len(meaningful) == 2:
            break
    if not meaningful:
        return dog_name
    # Keep a compact internal marker for legacy persistence only. The actual
    # continuity is the structured turn history, never this verbatim snippet.
    topic = meaningful[0]
    if len(topic) > 140:
        topic = topic[:137].rsplit(" ", 1)[0] + "…"
    return topic


def resume_welcome_text(
    owner_name: str | None, dog_name: str, previous_topic: str | None
) -> str:
    first_name = (owner_name or "").strip().split(" ", 1)[0].capitalize()
    hello = f"Ciao {first_name}" if first_name else "Ciao"
    # La continuità vive nella cronologia interna inviata al reasoner; il
    # primo messaggio non deve recitare un frammento della conversazione.
    del previous_topic
    return f"{hello}. Sono qui con te e {dog_name}. Raccontami cosa vuoi guardare oggi."


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


def _item_score(
    item: RealtimeContextItem,
    *,
    query_tokens: set[str],
    selected_domains: set[RealtimeDomain],
) -> tuple[int, int, datetime]:
    haystack = " ".join(
        [item.source_type, item.summary, *(str(v) for v in item.data.values())]
    ).casefold()
    overlap = len(query_tokens & context_tokens(haystack))
    source_domain = {
        "BEHAVIOR_EVENT": "BEHAVIOR",
        "PERSONAL_PATTERN": "BEHAVIOR",
        "DIGESTIVE_EVENT": "DIGESTIVE",
        "FEEDING_PERIOD": "NUTRITION",
        "CARE_EVENT": "CARE",
    }.get(item.source_type)
    domain_match = source_domain in selected_domains if source_domain else False
    # GENERAL is intentionally not a request for every specialist record. An
    # evidence item must match the current message or it stays out of GPT's
    # turn context. Routed specialist turns can use their own domain records.
    eligible = overlap > 0 or domain_match and "GENERAL" not in selected_domains
    return (
        (100 if eligible else 0)
        + overlap * 8
        + (25 if domain_match else 0),
        overlap,
        item.occurred_at or datetime.min.replace(tzinfo=UTC),
    )


def _select_realtime_items(
    personal: Any,
    *,
    user_text: str,
    domains: list[RealtimeDomain],
    limit: int = 16,
) -> list[RealtimeContextItem]:
    selected_domains = set(domains or ["GENERAL"])
    query_tokens = context_tokens(user_text) - context_tokens(personal.dog_name)
    items = [
        RealtimeContextItem(
            source_id=str(raw["source_id"]),
            source_type=str(raw["source_type"]),
            occurred_at=raw.get("occurred_at"),
            summary=str(raw["summary"]),
            data=dict(raw.get("data") or {}),
        )
        for raw in personal_to_realtime_items(personal)
    ]
    ranked = sorted(
        items,
        key=lambda item: _item_score(
            item, query_tokens=query_tokens, selected_domains=selected_domains
        ),
        reverse=True,
    )
    # With a genuinely general message, send no unrelated specialist evidence.
    # This is the important distinction between durable storage and turn context.
    if "GENERAL" in selected_domains:
        ranked = [
            item for item in ranked
            if _item_score(
                item, query_tokens=query_tokens, selected_domains=selected_domains
            )[0] > 0
            and _item_score(
                item, query_tokens=query_tokens, selected_domains=selected_domains
            )[1] > 0
        ]
    return [item for item in ranked if _item_score(
        item, query_tokens=query_tokens, selected_domains=selected_domains
    )[0] >= 100][:limit]



def realtime_context_from_personal(
    personal,
    *,
    domains: list[RealtimeDomain] | None = None,
    user_text: str = "",
) -> RealtimeDogContext:
    """Keep RealtimeDogContext as a voice/UI adapter over PersonalDogContext."""
    return RealtimeDogContext(
        dog_id=personal.dog_id,
        dog_name=personal.dog_name,
        owner_display_name=personal.owner_display_name,
        identity=dict(personal.identity),
        core_facts=personal_to_core_facts(personal),
        stable_facts=personal_to_stable_facts(
            personal, user_text=user_text, domains=domains, limit=16
        ),
        items=_select_realtime_items(
            personal, user_text=user_text, domains=domains or ["GENERAL"]
        ),
        missing=[key for key in personal.missing if key != "active_feeding" or set(domains or []) & {"NUTRITION", "DIGESTIVE"}],
    )


async def load_realtime_context_db(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    domains: list[RealtimeDomain],
    user_text: str = "",
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
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()

    evidence = await load_cross_domain_evidence_db(
        engine, user_id=user_id, dog_id=dog_id, domains=domains
    )
    dog_rec = DogRec(
        id=str(dog["id"]),
        owner_id=user_id,
        name=str(dog["name"]),
        birth_date=dog.get("birth_date"),
        age_stage=dog.get("age_stage"),
        size=dog.get("size"),
        breed_label=dog.get("breed_label"),
        is_mix=bool(dog.get("is_mix") or False),
        sex=dog.get("sex"),
        weight_kg=dog.get("weight_kg"),
        created_at=datetime.now(UTC),
    )
    lifestyle_dump = {
        "routine": dict((lifestyle or {}).get("routine_json") or {}),
        "preferences": dict((lifestyle or {}).get("preferences_json") or {}),
        "provenance": dict((lifestyle or {}).get("provenance_json") or {}),
        "last_confirmed_at": (lifestyle or {}).get("last_confirmed_at"),
    }
    story_rows = [
        {
            "id": str(row["id"]),
            "facts": list(row["facts_json"] or []),
            "confirmed_at": row["confirmed_at"],
        }
        for row in stories
    ]
    owner_name = str(dog["display_name"]) if dog.get("display_name") else None
    dog_context = build_dog_context(
        dog_rec, lifestyle_dump, owner_display_name=owner_name
    )
    personal = build_personal_dog_context(
        dog=dog_rec,
        dog_context=dog_context,
        lifestyle_dump=lifestyle_dump,
        stories=story_rows,
        evidence=evidence,
        owner_display_name=owner_name,
    )
    return realtime_context_from_personal(
        personal,
        domains=domains,
        user_text=user_text,
    )


def load_realtime_context_memory(
    store: InMemoryStore,
    *,
    dog_id: str,
    domains: list[RealtimeDomain],
    user_text: str = "",
) -> RealtimeDogContext:
    dog = store.dogs[dog_id]
    evidence = load_cross_domain_evidence_memory(
        store, dog_id=dog_id, domains=domains
    )
    lifestyle = store.dog_lifestyle_profiles.get((dog.owner_id, dog_id)) or {}
    if hasattr(lifestyle, "model_dump"):
        lifestyle_dump = lifestyle.model_dump()
    elif isinstance(lifestyle, dict):
        lifestyle_dump = {
            "routine": dict(
                lifestyle.get("routine") or lifestyle.get("routine_json") or {}
            ),
            "preferences": dict(
                lifestyle.get("preferences")
                or lifestyle.get("preferences_json")
                or {}
            ),
            "provenance": dict(
                lifestyle.get("provenance")
                or lifestyle.get("provenance_json")
                or {}
            ),
            "last_confirmed_at": lifestyle.get("last_confirmed_at"),
        }
    else:
        lifestyle_dump = {}
    stories = [
        row
        for row in store.owner_reported_observations.values()
        if row.get("dog_id") == dog_id
        and row.get("user_id") == dog.owner_id
        and row.get("status") == "CONFIRMED"
    ]
    owner_name = getattr(store.profiles.get(dog.owner_id), "display_name", None)
    dog_context = build_dog_context(
        dog, lifestyle_dump, owner_display_name=owner_name
    )
    personal = build_personal_dog_context(
        dog=dog,
        dog_context=dog_context,
        lifestyle_dump=lifestyle_dump,
        stories=stories,
        evidence=evidence,
        owner_display_name=owner_name,
    )
    return realtime_context_from_personal(
        personal,
        domains=domains,
        user_text=user_text,
    )
