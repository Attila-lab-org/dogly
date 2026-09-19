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
    load_cross_domain_evidence_db,
    load_cross_domain_evidence_memory,
    personal_to_realtime_items,
    personal_to_stable_facts,
)
from app.domains.repository import InMemoryStore
from app.knowledge.registry import get_registry

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
    previous_topic: str | None = None
    previous_turns: list[dict[str, str]] = Field(default_factory=list)

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


_RESUME_GREETING = re.compile(
    r"^\s*(ciao|salve|buongiorno|buonasera|ehi|hey|ciao dogly)[!.?\s]*$",
    re.IGNORECASE,
)


def conversation_topic(user_texts: list[str], *, dog_name: str) -> str:
    for line in reversed(user_texts):
        cleaned = " ".join((line or "").split())
        if not cleaned or _RESUME_GREETING.fullmatch(cleaned):
            continue
        if len(cleaned) > 90:
            cleaned = cleaned[:87].rsplit(" ", 1)[0] + "…"
        return cleaned
    return dog_name


def resume_welcome_text(
    owner_name: str | None, dog_name: str, previous_topic: str | None
) -> str:
    first_name = (owner_name or "").strip().split(" ", 1)[0].capitalize()
    hello = f"Ciao {first_name}" if first_name else "Ciao"
    if previous_topic:
        return (
            f"{hello}, l'ultima volta parlavamo di {previous_topic}. "
            "Vuoi riprendere la vecchia chiacchierata o parliamo di altro?"
        )
    return f"{hello}, sono qui per te e {dog_name}. Cosa vuoi capire oggi?"


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



def realtime_context_from_personal(
    personal,
    *,
    previous_topic: str | None = None,
    previous_turns: list[dict[str, str]] | None = None,
) -> RealtimeDogContext:
    """Keep RealtimeDogContext as a voice/UI adapter over PersonalDogContext."""
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
    return RealtimeDogContext(
        dog_id=personal.dog_id,
        dog_name=personal.dog_name,
        owner_display_name=personal.owner_display_name,
        identity=dict(personal.identity),
        stable_facts=personal_to_stable_facts(personal),
        items=items[:12],
        missing=list(personal.missing),
        previous_topic=previous_topic,
        previous_turns=list(previous_turns or []),
    )


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
    return realtime_context_from_personal(personal)


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
    "FOOD_PRODUCT": "Cibo",
    "CARE_EVENT": "Cura",
}
_MISSING_LABEL = {
    "active_feeding": "alimentazione attiva",
    "weight": "peso attuale",
    "confirmed_routine": "routine confermata",
}


_COMPANION_CARD_IDS = (
    "OBS_TAIL_003",
    "OBS_BODY_002",
    "OBS_BODY_004",
    "AUD_BARK_001",
    "AUD_GROWL_001",
    "AUD_WHINE_001",
    "DIGESTIVE_001",
    "DIGESTIVE_002",
    "NUTRITION_001",
    "PRIOR_BREED_001",
    "PERSONAL_001",
)

_COMPANION_LINES = {
    "OBS_TAIL_003": "Scodinzolare non vuol dire automaticamente che è felice: conta corpo, contesto e quel cane.",
    "OBS_BODY_002": "Un corpo rigido è un segnale da ascoltare, non una prova di aggressività.",
    "OBS_BODY_004": "L'inchino di gioco è un invito, ma vale solo se il resto del momento è gioco.",
    "AUD_BARK_001": "L'abbaio non è una parola. Può essere allerta, richiesta, gioco o disagio.",
    "AUD_GROWL_001": "Il ringhio non è sempre aggressione: può comparire anche nel gioco o per chiedere spazio.",
    "AUD_WHINE_001": "Il piagnucolio può essere richiesta, disagio o eccitazione: non è una frase.",
    "DIGESTIVE_001": "Una foto della cacca dice come sta andando oggi, non qual è la malattia.",
    "DIGESTIVE_002": "Vomito ripetuto, sangue, feci nere, cane abbattuto o pancia gonfia: si sente il veterinario, non si aspetta.",
    "NUTRITION_001": "Cibo e quantità si ragionano sul cane vero: età, peso, attività e come digerisce. Non si inventa una dieta.",
    "PRIOR_BREED_001": "La razza è un accenno debole. Il cane davanti a te conta più dello stereotipo.",
    "PERSONAL_001": "Un'abitudine del cane nasce solo se lo stesso modo si ripete, non da un episodio solo.",
}


def companion_science_brief() -> list[str]:
    """Owner-facing science the voice may use to talk about dogs in general."""
    cards = {card.id: card for card in get_registry().base_knowledge_cards}
    lines: list[str] = []
    for card_id in _COMPANION_CARD_IDS:
        text = _COMPANION_LINES.get(card_id)
        if text:
            lines.append(f"- {text}")
            continue
        card = cards.get(card_id)
        if card:
            lines.append(f"- {card.not_conclude}")
    return lines


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
            known.append(f"- [{fact.get('owner_label') or 'raccontato'}] {statement}")
    events: list[str] = []
    for item in context.items:
        if item.source_type in {"FEEDING_PERIOD", "FOOD_PRODUCT"}:
            continue
        label = _SOURCE_LABEL.get(item.source_type, "Nota")
        headline = item.data.get("headline") if item.data else None
        when = (
            item.occurred_at.strftime("%d/%m")
            if item.occurred_at
            else ""
        )
        prefix = f"{label} {when}".strip()
        prov = (item.data or {}).get("owner_label")
        suffix = f" [{prov}]" if prov else ""
        events.append(f"- {prefix}{suffix}: {headline or item.summary}")
    missing = [
        _MISSING_LABEL.get(key, key) for key in context.missing if key in _MISSING_LABEL
    ]
    science = "\n".join(companion_science_brief())
    return "\n".join(
        [
            "Sei DOGly: l'amico del proprietario con cui si parla di cani.",
            f"Parli di cani in generale, e in particolare di {context.dog_name}, perché è il cane di questo profilo.",
            "Se il profilo fosse un altro cane, parleresti di quello. Non sei un esperto generico senza padrone.",
            "Parli SOLO in italiano, con una voce calma, calda e naturale.",
            "Sei una persona competente e calorosa, non un assistente vocale e non un annunciatore.",
            "Una sola voce. Finisci sempre la frase. Non spezzarla, non ricominciarla, non parlarti sopra.",
            "Parla come un amico vicino: caldo, curioso, presente. Ritmo umano, niente recita.",
            "Non pensare ad alta voce. Non dire un attimo, sto pensando, vedo, elaboro, ok, certo.",
            "Quando parlano di cani in generale, usa CANINE_SCIENCE. Puoi spiegare, confrontare, raccontare con competenza.",
            f"Quando parlano di {context.dog_name}, usa prima il suo profilo e le sue letture. Non inventare la sua vita.",
            "Puoi unire le due cose: prima ciò che è vero sui cani, poi cosa vale per questo cane se hai dati.",
            "3-6 frasi complete e utili. Poi fai spesso UNA domanda naturale da amico: cosa ha notato, come sta il cane, cosa vuole capire.",
            "Una domanda sola per turno, non un interrogatorio. Tieni viva la conversazione.",
            "Distingui esplicitamente osservato / raccontato / imparato / generale sui cani.",
            "Salute: niente diagnosi. Spiega cosa osservare e quando è prudente sentire il veterinario.",
            "Se per capire un comportamento di adesso serve vederlo, chiedi un video breve.",
            "Se non respira, collassa, ha convulsioni, può aver ingerito veleno o perde molto sangue, di' subito di chiamare un pronto soccorso veterinario.",
            f"Il client ha già salutato così: {welcome}. Non ripetere quel saluto.",
            f"Proprietario: {owner or 'non indicato'}. Cane di questo profilo: {context.dog_name}.",
            f"Profilo: {', '.join(profile) if profile else 'ancora essenziale'}.",
            "Fatti confermati dal proprietario:",
            "\n".join(known) if known else "- nessuno ancora",
            "Alimentazione:",
            "\n".join(
                f"- {item.summary}"
                for item in context.items
                if item.source_type in {"FEEDING_PERIOD", "FOOD_PRODUCT"}
            )
            or f"- Non hai ancora il cibo di {context.dog_name}. Se te lo dicono, proponilo come ricordo da confermare.",
            "Ultime letture DOGly:",
            "\n".join(events) if events else "- nessuna analisi ancora",
            f"Non hai ancora: {', '.join(missing)}." if missing else "Il profilo essenziale è presente.",
            (
                f"ULTIMA CHIACCHIERATA ({context.previous_topic}):\n"
                + "\n".join(
                    f"- {turn.get('role')}: {turn.get('content')}"
                    for turn in context.previous_turns[:8]
                )
                + "\nSe vuole riprendere, continua da qui. Se vuole altro, cambia argomento senza insistere."
            )
            if context.previous_topic
            else "Non c'è una chiacchierata precedente da riprendere.",
            "CANINE_SCIENCE:",
            science,
        ]
    )


def load_realtime_context_memory(
    store: InMemoryStore,
    *,
    dog_id: str,
    domains: list[RealtimeDomain],
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
    memory = store.realtime_conversation_memories.get((dog.owner_id, dog_id), {})
    return realtime_context_from_personal(
        personal,
        previous_topic=memory.get("topic"),
        previous_turns=list(memory.get("turns_json") or []),
    )
