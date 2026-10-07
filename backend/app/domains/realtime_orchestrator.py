"""Grounded turn orchestration for DOGly Realtime.

The language model verbalizes a governed decision. It is not the personal
memory, the safety layer, or a source of dog facts.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.contracts.realtime import RealtimeDecision, RealtimeDomain
from app.domains.owner_stories import extract_owner_reported_facts
from app.domains.realtime_context import RealtimeDogContext
from app.knowledge.claim_validation import (
    extract_claims_from_provider_payload,
    infer_claims_from_answer,
    validate_claims,
)
from app.knowledge.reasoning_core import CANINE_REASONING_CORE

REALTIME_ORCHESTRATOR_VERSION = "realtime-orchestrator/v5"
REALTIME_HISTORY_LIMIT = 8

_URGENT_RULES: tuple[tuple[str, str, str], ...] = (
    (
        "EMERGENCY_BREATHING",
        r"^\s*{subject}\s+(?:non respira|fa fatica a respirare|sta soffocando)\b",
        "Se fa fatica a respirare o sta soffocando, contatta subito un pronto soccorso veterinario. Non aspettare una risposta in chat.",
    ),
    (
        "EMERGENCY_COLLAPSE",
        r"^\s*{subject}\s+(?:non si alza|sta avendo convulsioni)\b",
        "Questo può richiedere assistenza urgente: contatta subito un pronto soccorso veterinario e segui le loro indicazioni.",
    ),
    (
        "POSSIBLE_POISONING",
        r"^\s*{subject}\s+(?:ha ingerito|può aver ingerito)\s+(?:veleno|topicida|cioccolato|xilitolo|antigelo)\b",
        "Se può aver ingerito una sostanza tossica, chiama subito il veterinario o un centro antiveleni veterinario. Non provocare il vomito senza indicazione professionale.",
    ),
)
_GREETING = re.compile(
    r"^\s*(ciao|salve|buongiorno|buonasera|ehi|hey|ciao dogly)[!.?\s]*$",
    re.IGNORECASE,
)
def deterministic_safety_interrupt(
    user_text: str, *, dog_name: str | None = None
) -> RealtimeDecision | None:
    subject = (
        rf"(?:{re.escape(dog_name.strip())}|il mio cane|il cane|un cane)"
        if dog_name and dog_name.strip()
        else r"(?:[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'-]*|il mio cane|il cane|un cane)"
    )
    for code, pattern, answer in _URGENT_RULES:
        if re.search(pattern.format(subject=subject), user_text, re.IGNORECASE):
            return RealtimeDecision(
                assistant_text=answer,
                terminal_state="SAFETY_INTERRUPT",
                domains=["CARE"],
                safety_flags=[code],
            )
    return None


_EXPLICIT_MEMORY_REQUEST = re.compile(
    r"^\s*(?:ricordati(?:\s+che)?|tieni\s+presente(?:\s+che)?|"
    r"salva(?:\s+che)?|annota(?:\s+che)?|da\s+oggi)\s*[:,-]?\s*",
    re.IGNORECASE,
)

_EPISODIC_MARKERS = {
    "oggi", "ieri", "stamattina", "stasera", "poco fa",
    "questa settimana", "in questi giorni", "all'improvviso",
}


def explicit_memory_request(user_text: str) -> dict[str, str] | None:
    """Extract one explicit owner statement outside the GPT response call."""
    match = _EXPLICIT_MEMORY_REQUEST.match(user_text or "")
    if not match:
        return None
    statement = " ".join((user_text or "")[match.end() :].split()).strip(" .,:;-")
    facts = extract_owner_reported_facts(statement)
    if len(facts) != 1:
        return None
    return {"statement": facts[0].statement, "category": facts[0].category}


def natural_memory_candidate(user_text: str) -> dict[str, str] | None:
    """Suggest a stable owner fact discovered in ordinary conversation."""
    if _EXPLICIT_MEMORY_REQUEST.match(user_text or ""):
        return explicit_memory_request(user_text)
    facts = [
        fact for fact in extract_owner_reported_facts(user_text)
        if fact.category in {"HEALTH", "DIET", "ROUTINE", "PREFERENCE"}
        and not any(marker in fact.statement.casefold() for marker in _EPISODIC_MARKERS)
    ]
    if len(facts) != 1:
        return None
    return {"statement": facts[0].statement, "category": facts[0].category}


# Realtime needs the same governance in a smaller spoken contract. The client
# controls turn-taking; the model should supply one human answer.
_SYSTEM = CANINE_REASONING_CORE + r"""

Sei DOGly: una conversazione personale sul cane indicato nel contesto.
Rispondi in italiano naturale, diretto e caldo, come in una chat tra persone.
Parti dal messaggio appena ricevuto e usa il contesto del cane solo quando è pertinente.
La frase corrente ha priorità sulla risposta precedente. Non ripetere spiegazioni già date.
Mantieni il filo con i messaggi precedenti senza recitare la cronologia e senza
trasformare la chat in un questionario.
Parla come qualcuno che segue davvero questa conversazione: rispondi prima al
bisogno concreto del turno e usa la continuità solo quando aiuta. Evita formule
da questionario, riepiloghi automatici e consigli generici scollegati.
Se il proprietario cambia argomento, segui il nuovo messaggio senza trascinare
il tema precedente. Per riferimenti come "ieri" o "prima", usa la cronologia
disponibile e non inventare date o dettagli mancanti.

Rispondi con la lunghezza necessaria alla domanda. Per una richiesta semplice,
bastano poche frasi. Dai subito il consiglio principale e sviluppalo solo quanto
serve per renderlo chiaro.

Non trasformare la risposta in un articolo o in una scheda tecnica.
Evita titoli, elenchi, numerazioni, grassetto, asterischi e altre formattazioni
Markdown, salvo quando siano indispensabili per capire la risposta.

Fai una domanda solo se la risposta cambia davvero la lettura, l’azione o la
sicurezza. Non aggiungere una domanda per chiudere automaticamente il messaggio.
Se non serve una domanda, continua la conversazione con ciò che sai già.

Usa il nome e le caratteristiche del cane solo quando sono presenti nel contesto.
Non sostituire il nome reale con un nome fisso e non inventare fatti, abitudini,
emozioni o diagnosi.
Se il proprietario esprime affetto o orgoglio, riconosci il legame senza trasformarlo
in un rischio; se porta una preoccupazione, resta sul problema senza patologizzare.

Se il proprietario corregge una lettura, accetta la correzione e riparti da quella.
La correzione sostituisce la lettura precedente: non difenderla e non riproporla
senza nuove evidenze concrete.
Non trasformare un comportamento normale o un’emozione quotidiana in un problema
clinico o psicologico senza un segnale concreto che lo giustifichi.
Se una foto o un video aggiunge informazioni reali, chiedilo con un invito breve
e spiega perché può servire. Quando arriva una foto, separa ciò che si vede davvero
da ciò che non si può verificare.

Non diagnosticare e non affermare causalità certe. In caso di segnali urgenti,
indirizza subito al veterinario.

La memoria stabile viene proposta separatamente e richiede conferma dell’utente.
"""


def openai_realtime_decision_schema() -> dict[str, Any]:
    """Schema piccolo: GPT scrive la risposta, il server conserva i confini."""
    return {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "assistant_text",
            "action_type",
            "action_options",
            "action_prompt",
            "used_source_ids",
        ],
        "properties": {
            "assistant_text": {"type": "string"},
            "action_type": {
                "type": "string",
                "enum": ["none", "options", "photo", "video"],
            },
            "action_options": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 3,
            },
            "action_prompt": {"type": ["string", "null"]},
            "used_source_ids": {"type": "array", "items": {"type": "string"}},
        },
    }

def _provider_decision(
    content: str,
    *,
    domains: list[RealtimeDomain],
) -> RealtimeDecision | None:
    try:
        raw = json.loads(content)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    answer = raw.get("assistant_text")
    if not isinstance(answer, str) or not answer.strip():
        return None
    action_type = raw.get("action_type")
    if action_type not in {"none", "options", "photo", "video"}:
        return None
    action_options = [
        str(option).strip()
        for option in (raw.get("action_options") if isinstance(raw.get("action_options"), list) else [])
        if isinstance(option, str) and option.strip()
    ][:3]
    action_prompt = raw.get("action_prompt")
    if not isinstance(action_prompt, str) or not action_prompt.strip():
        action_prompt = None
    question_options = action_options if action_type == "options" else []
    media_invite = action_type.upper() if action_type in {"photo", "video"} else None
    media_prompt = action_prompt if media_invite else None
    try:
        return RealtimeDecision(
            assistant_text=answer.strip(),
            question_options=question_options,
            domains=domains,
            # Safety flags are server-owned; provider output cannot activate an
            # interrupt or change the safety state of this turn.
            safety_flags=[],
            used_source_ids=[
                str(value) for value in raw.get("used_source_ids", []) if value
            ][:12],
            media_invite=media_invite,
            media_prompt=media_prompt.strip()[:180] if media_prompt else None,
            claims=extract_claims_from_provider_payload(raw),
        )
    except (TypeError, ValidationError):
        return None


def _last_assistant_text(history: list[dict[str, Any]]) -> str | None:
    return next((
        item["content"] for item in reversed(history)
        if item.get("role") == "assistant" and item.get("content", "").strip()
    ), None)


def _recent_media_invite(history: list[dict[str, Any]]) -> bool:
    """Legacy fallback guard for sessions created before media metadata existed."""
    return any(
        item.get("role") == "assistant"
        and item.get("media_invite")
        for item in history[-6:]
    )


def _recent_conversation(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only the latest complete conversational window for GPT."""
    turns = [
        {
            "role": item.get("role"),
            "content": item.get("content"),
        }
        for item in history
        if item.get("role") in {"user", "assistant"}
        and isinstance(item.get("content"), str)
        and item["content"].strip()
    ]
    return turns[-REALTIME_HISTORY_LIMIT:]


def _apply_conversation_policy(
    decision: RealtimeDecision, *, context: RealtimeDogContext, user_text: str,
    history: list[dict[str, Any]], domains: list[RealtimeDomain],
    image_attached: bool = False,
) -> RealtimeDecision:
    """Apply only server-owned turn boundaries; GPT owns the wording and meaning."""
    data = decision.model_dump()
    if decision.safety_flags:
        data.update(media_invite=None, media_prompt=None)
        return RealtimeDecision.model_validate(data)
    # Conversational meaning belongs to GPT. This hook now only preserves
    # server-owned safety invariants; user wording and follow-up decisions pass
    # through unchanged.
    return RealtimeDecision.model_validate(data)


def _fallback_decision(
    *,
    text: str,
    context: RealtimeDogContext,
    domains: list[RealtimeDomain],
    history: list[dict[str, Any]] | None = None,
    image_attached: bool = False,
) -> RealtimeDecision:
    name = context.dog_name
    history = history or []
    if image_attached:
        return RealtimeDecision(
            assistant_text="La foto è arrivata, ma ora non riesco a leggerla. Non voglio dirti di aver visto qualcosa che non ho verificato: possiamo riprovare tra poco.",
            terminal_state="ABSTAINED", domains=domains,
        )
    latest = next(
        (
            item
            for item in context.items
            if (
                ("DIGESTIVE" in domains and item.source_type == "DIGESTIVE_EVENT")
                or ("BEHAVIOR" in domains and item.source_type == "BEHAVIOR_EVENT")
            )
        ),
        None,
    )
    if latest and not history:
        latest_text = str(
            (latest.data or {}).get("headline")
            or latest.summary
            or "Ho una lettura da approfondire"
        )
        friendly = " ".join(latest_text.split())
        assistant_text = (
            friendly
            if re.match(rf"^{re.escape(name)}\b", friendly, flags=re.IGNORECASE)
            else f"Per {name}: {friendly}"
        )
        return RealtimeDecision(
            assistant_text=assistant_text,
            domains=domains,
            used_source_ids=[latest.source_id],
        )
    if history:
        return RealtimeDecision(
            assistant_text="Non riesco a risponderti bene in questo momento. Quello che mi hai raccontato resta qui: riproviamo tra poco.",
            terminal_state="ABSTAINED", domains=domains,
        )
    if "BEHAVIOR" in domains:
        return RealtimeDecision(
            assistant_text=(
                f"Per capire cosa sta comunicando {name} in questo momento devo vedere "
                "come usa corpo, movimento e suono insieme. Mandami un breve video del momento."
            ),
            domains=domains,
            behavior_handoff=True,
            media_invite="VIDEO",
            media_prompt="Fammi vedere come si comporta in quel momento",
        )
    return RealtimeDecision(
        assistant_text=(
            f"Su questo non ho ancora un dato personale sufficiente per {name}. "
            "Posso aiutarti senza indovinare se mi racconti cosa è successo oggi."
        ),
        question=f"Qual è il cambiamento concreto che hai notato in {name}?",
        question_options=["È successo oggi", "Succede spesso", "È una cosa nuova"],
        question_information_gain="CHANGES_MEANING",
        domains=domains,
    )



def _context_ids(context: RealtimeDogContext) -> set[str]:
    ids = {item.source_id for item in context.items}
    for fact in [*context.core_facts, *context.stable_facts]:
        source_id = fact.get("source_id")
        if source_id:
            ids.add(str(source_id))
    return ids


def _apply_claim_governance(
    decision: RealtimeDecision,
    *,
    context: RealtimeDogContext,
    provider_raw: dict | None = None,
    safety_blocked: bool = False,
) -> tuple[RealtimeDecision, dict]:
    claims = list(decision.claims) or extract_claims_from_provider_payload(
        provider_raw
    )
    if not claims:
        claims = infer_claims_from_answer(
            decision.assistant_text,
            used_source_ids=list(decision.used_source_ids),
        )
    audit_decision = validate_claims(
        claims,
        context_ids=_context_ids(context),
        safety_blocked=safety_blocked,
    )
    # Governance is an audit boundary. It must not become a second writer for
    # the owner's answer after GPT has already handled the current context.
    decision = decision.model_copy(update={"claims": claims})
    return decision, audit_decision.model_dump(mode="json")


async def orchestrate_realtime_turn(
    *,
    settings: Settings,
    user_text: str,
    domains: list[RealtimeDomain],
    context: RealtimeDogContext,
    history: list[dict[str, Any]],
    image_url: str | None = None,
    media_context: str | None = None,
) -> tuple[RealtimeDecision, dict[str, Any]]:
    safety = deterministic_safety_interrupt(user_text, dog_name=context.dog_name)
    if safety:
        return safety, {"provider": "deterministic", "version": REALTIME_ORCHESTRATOR_VERSION}

    if not image_url and _GREETING.fullmatch(user_text):
        owner = (context.owner_display_name or "").strip().split(" ", 1)[0].capitalize()
        hello = f"Ciao {owner}," if owner else "Ciao,"
        return RealtimeDecision(
            assistant_text=(
                f"{hello} ci sono. Dimmi pure cosa vuoi capire di "
                f"{context.dog_name} oggi."
            ),
            domains=["GENERAL"],
        ), {
            "provider": "deterministic_greeting",
            "version": REALTIME_ORCHESTRATOR_VERSION,
        }

    if (
        settings.ai_kill_switch
        or settings.realtime_kill_switch
        or not settings.realtime_enabled
        or not settings.openai_api_key
    ):
        fallback = _fallback_decision(
            text=user_text, context=context, domains=domains, history=history,
            image_attached=bool(image_url),
        )
        fallback, canine_audit = _apply_claim_governance(fallback, context=context)
        return fallback, {
            "provider": "deterministic",
            "version": REALTIME_ORCHESTRATOR_VERSION,
            "canine_intelligence": canine_audit,
        }

    recent_history = _recent_conversation(history)
    payload = {
        "personal_dog_context": {
            "dog_id": context.dog_id,
            "dog_name": context.dog_name,
            "identity": context.identity,
            "core_facts": context.core_facts,
            "retrieved_personal_facts": context.stable_facts,
            "relevant_evidence": [item.model_dump(mode="json") for item in context.items],
            "missing": context.missing,
        },
        "context_contract": "personal-dog-core-plus-evidence/v1",
        "conversation": recent_history,
        "conversation_state": {
            "current_message_has_priority": True,
            # Media metadata is server-owned turn state; keep it from the
            # original history because the GPT context projection strips it.
            "recent_media_invite": _recent_media_invite(history),
            "image_attached": bool(image_url),
            "last_assistant_message": _last_assistant_text(recent_history),
            "instruction": "Riconosci cambi di significato, correzioni e risposte già date; non ripartire dalla vecchia analisi.",
        },
        "owner_turn": user_text,
        "owner_media_context": media_context,
    }
    user_content: str | list[dict[str, Any]] = (
        "PERSONAL_DOG_CONTEXT\n"
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    )
    if image_url:
        user_content = [
            {
                "type": "text",
                "text": (
                    "PERSONAL_DOG_CONTEXT\n"
                    + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                ),
            },
            {"type": "image_url", "image_url": {"url": image_url, "detail": "auto"}},
        ]
    body: dict[str, Any] = {
        "model": settings.realtime_reasoning_model,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": user_content,
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "dogly_realtime_turn",
                "strict": True,
                "schema": openai_realtime_decision_schema(),
            },
        },
    }
    if (
        settings.realtime_reasoning_model.lower().startswith("gpt-5")
        and settings.realtime_reasoning_effort
    ):
        body["reasoning_effort"] = settings.realtime_reasoning_effort

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            raw = response.json()
    except (httpx.HTTPError, ValueError):
        fallback = _fallback_decision(
            text=user_text, context=context, domains=domains, history=history,
            image_attached=bool(image_url),
        )
        fallback, canine_audit = _apply_claim_governance(fallback, context=context)
        return fallback, {
            "provider": "deterministic_fallback",
            "failed_provider": "openai",
            "version": REALTIME_ORCHESTRATOR_VERSION,
            "canine_intelligence": canine_audit,
        }
    try:
        content = raw["choices"][0]["message"]["content"]
    except (KeyError, TypeError, IndexError):
        content = ""
    decision = _provider_decision(content, domains=domains)
    if decision is None:
        fallback = _fallback_decision(
            text=user_text, context=context, domains=domains, history=history,
            image_attached=bool(image_url),
        )
        fallback, canine_audit = _apply_claim_governance(fallback, context=context)
        return fallback, {
            "provider": "deterministic_fallback",
            "failed_provider": "openai_schema",
            "version": REALTIME_ORCHESTRATOR_VERSION,
            "canine_intelligence": canine_audit,
        }

    decision = _apply_conversation_policy(
        decision,
        context=context,
        user_text=user_text,
        history=history,
        domains=domains,
        image_attached=bool(image_url),
    )

    allowed_ids = _context_ids(context)
    decision.used_source_ids = [
        source_id for source_id in decision.used_source_ids if source_id in allowed_ids
    ]
    try:
        provider_raw = json.loads(content) if content else None
    except (TypeError, json.JSONDecodeError):
        provider_raw = None
    decision, canine_audit = _apply_claim_governance(
        decision,
        context=context,
        provider_raw=provider_raw if isinstance(provider_raw, dict) else None,
        safety_blocked=False,
    )
    return decision, {
        "provider": "openai",
        "model": settings.realtime_reasoning_model,
        "version": REALTIME_ORCHESTRATOR_VERSION,
        "usage": raw.get("usage", {}),
        "canine_intelligence": canine_audit,
    }
