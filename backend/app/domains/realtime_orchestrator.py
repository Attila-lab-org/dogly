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

_URGENT_RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "EMERGENCY_BREATHING",
        re.compile(
            r"\b(non respira|fatica a respirare|soffoca|soffocando)\b",
            re.IGNORECASE,
        ),
        "Se fa fatica a respirare o sta soffocando, contatta subito un pronto soccorso veterinario. Non aspettare una risposta in chat.",
    ),
    (
        "EMERGENCY_COLLAPSE",
        re.compile(
            r"\b(collasso|collassato|non si alza|convulsione|convulsioni)\b",
            re.IGNORECASE,
        ),
        "Questo può richiedere assistenza urgente: contatta subito un pronto soccorso veterinario e segui le loro indicazioni.",
    ),
    (
        "POSSIBLE_POISONING",
        re.compile(
            r"\b(veleno|avvelen|topicida|cioccolato|xilitolo|antigelo)\b",
            re.IGNORECASE,
        ),
        "Se può aver ingerito una sostanza tossica, chiama subito il veterinario o un centro antiveleni veterinario. Non provocare il vomito senza indicazione professionale.",
    ),
    (
        "URGENT_DIGESTIVE",
        re.compile(
            r"\b(feci nere|cacca nera|molto sangue|sangue abbondante|vomita continuamente|vomito ripetuto)\b",
            re.IGNORECASE,
        ),
        "Questo segnale merita un contatto veterinario tempestivo, soprattutto se si ripete o il cane appare abbattuto. Se sta peggiorando, contatta subito una struttura veterinaria.",
    ),
)
_GREETING = re.compile(
    r"^\s*(ciao|salve|buongiorno|buonasera|ehi|hey|ciao dogly)[!.?\s]*$",
    re.IGNORECASE,
)
# Conservative concern hints remain only for fallback safety/abstention.
_CONCRETE_CONCERN = re.compile(
    r"\b(perde (?:il )?pelo|ferit\w*|prurito|prude|si gratta|dolore|zopp\w*|"
    r"vomit\w*|diarrea|sangue|non mangia|non beve|abbattut\w*|sta male|"
    r"preoccup\w*)\b", re.IGNORECASE,
)
_GRIEF = re.compile(r"\b(mi manca|morto|morta|non c'è più|scomparso|scomparsa)\b", re.IGNORECASE)
_DECLINE_MEDIA = re.compile(
    r"\b(non (?:voglio|posso|ho voglia di) (?:mandar\w*|inviar\w*|fare|scattar\w*)"
    r"|niente foto|senza foto|non ora|preferisco parlare)\b", re.IGNORECASE,
)
def deterministic_safety_interrupt(user_text: str) -> RealtimeDecision | None:
    for code, pattern, answer in _URGENT_RULES:
        if pattern.search(user_text):
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

Sei DOGly: un amico esperto che conosce il cane della persona con cui parla.
Rispondi in italiano naturale, diretto e caldo. Parti da ciò che il proprietario
ha appena detto; la sua frase corrente ha priorità sulla risposta precedente.
Usa il contesto personale di Oreo come fonte, senza inventare fatti, abitudini,
emozioni o diagnosi. Distingui ciò che è raccontato, osservato e già confermato,
ma non esporre questa distinzione come gergo.

La conversazione deve avanzare: riconosci il significato dell'ultimo messaggio,
aggiungi una lettura utile e proponi un solo passo successivo solo se serve.
Non ripetere la spiegazione appena data. Se il proprietario corregge una lettura,
accetta la correzione e riparti da quella. Se condivide affetto o orgoglio,
riconosci prima il legame; se porta una preoccupazione, resta sul problema senza
trasformare l'affetto in un rischio. Parla direttamente a lui, non in terza persona.

Fai una sola domanda quando la risposta cambia davvero significato, azione o
sicurezza. Le opzioni sono ammesse solo quando rendono più facile rispondere.
Non creare domande o menu per tenere viva la chat. Se una foto o un video aggiunge
informazioni reali, chiedilo con un invito breve e legato al motivo; una foto può
anche condividere un momento bello. Se arriva un'immagine, commentala per il motivo
dichiarato e separa ciò che si vede da ciò che non si può verificare.

Non diagnosticare, non affermare causalità certa e non dare istruzioni d'emergenza
oltre il necessario. In caso di segnali urgenti, la risposta deve indirizzare subito
al veterinario. La memoria stabile viene proposta separatamente quando emerge
una possibile informazione duratura, oppure su richiesta esplicita del
proprietario; serve sempre una conferma separata e il modello non la crea dentro
questa chiamata.
Restituisci soltanto JSON conforme allo schema richiesto.
"""


def openai_realtime_decision_schema() -> dict[str, Any]:
    """Schema piccolo: GPT scrive la risposta, il server conserva i confini."""
    return {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "assistant_text",
            "question",
            "question_options",
            "question_information_gain",
            "terminal_state",
            "behavior_handoff",
            "media_invite",
            "media_prompt",
            "used_source_ids",
        ],
        "properties": {
            "assistant_text": {"type": "string"},
            "question": {"type": ["string", "null"]},
            "question_options": {"type": "array", "items": {"type": "string"}},
            "question_information_gain": {
                "type": "string",
                "enum": ["NONE", "CHANGES_MEANING", "CHANGES_ACTION", "CHANGES_SAFETY"],
            },
            "terminal_state": {
                "type": "string",
                "enum": ["ANSWERED", "ABSTAINED", "BEHAVIOR_VIDEO_HANDOFF", "MEMORY_CONFIRMATION_REQUIRED"],
            },
            "behavior_handoff": {"type": "boolean"},
            "media_invite": {"type": ["string", "null"], "enum": ["PHOTO", "VIDEO", None]},
            "media_prompt": {"type": ["string", "null"]},
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
    question = raw.get("question") if isinstance(raw.get("question"), str) else None
    question_options = [
        str(option).strip()
        for option in (raw.get("question_options") if isinstance(raw.get("question_options"), list) else [])
        if isinstance(option, str) and option.strip()
    ][:3]
    information_gain = raw.get("question_information_gain")
    allowed_gain = {
        "CHANGES_MEANING",
        "CHANGES_ACTION",
        "CHANGES_SAFETY",
    }
    if question and information_gain not in allowed_gain:
        question = None
        information_gain = "NONE"
        question_options = []
    terminal = raw.get("terminal_state")
    if terminal not in {
        "ANSWERED",
        "ABSTAINED",
        "BEHAVIOR_VIDEO_HANDOFF",
        "MEMORY_CONFIRMATION_REQUIRED",
    }:
        terminal = "ANSWERED"
    media_invite = raw.get("media_invite")
    if media_invite not in {"PHOTO", "VIDEO"}:
        media_invite = None
    media_prompt = raw.get("media_prompt")
    if not isinstance(media_prompt, str) or not media_prompt.strip():
        media_prompt = None
    try:
        return RealtimeDecision(
            assistant_text=answer.strip(),
            question=question,
            question_options=question_options,
            terminal_state=terminal,
            domains=domains,
            # Safety flags are server-owned; provider output cannot activate an
            # interrupt or change the safety state of this turn.
            safety_flags=[],
            used_source_ids=[
                str(value) for value in raw.get("used_source_ids", []) if value
            ][:12],
            question_information_gain=information_gain or "NONE",
            behavior_handoff=bool(raw.get("behavior_handoff", False)),
            media_invite=media_invite,
            media_prompt=media_prompt.strip()[:180] if media_prompt else None,
            claims=extract_claims_from_provider_payload(raw),
        )
    except (TypeError, ValidationError):
        return None


def _owner_turn_signals(text: str) -> list[str]:
    """Hints only: mixed messages and implicit emotion are interpreted by the model."""
    signals = []
    if _CONCRETE_CONCERN.search(text):
        signals.append("CONCRETE_CONCERN")
    if _GRIEF.search(text):
        signals.append("LOSS_OR_ABSENCE")
    if _DECLINE_MEDIA.search(text):
        signals.append("MEDIA_DECLINED")
    return signals


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
    signals = _owner_turn_signals(text)
    if image_attached:
        return RealtimeDecision(
            assistant_text="La foto è arrivata, ma ora non riesco a leggerla. Non voglio dirti di aver visto qualcosa che non ho verificato: possiamo riprovare tra poco.",
            terminal_state="ABSTAINED", domains=domains,
        )
    if "LOSS_OR_ABSENCE" in signals:
        return RealtimeDecision(
            assistant_text=f"Si sente quanto ti manca {name}. Se ti va di parlarne, ti ascolto.",
            domains=domains,
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
    safety = deterministic_safety_interrupt(user_text)
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

    payload = {
        "personal_dog_context": {
            "dog_id": context.dog_id,
            "dog_name": context.dog_name,
            "identity": context.identity,
            "core_oreo": context.core_facts,
            "retrieved_personal_facts": context.stable_facts,
            "relevant_evidence": [item.model_dump(mode="json") for item in context.items],
            "missing": context.missing,
        },
        "context_contract": "personal-dog-core-plus-evidence/v1",
        "routed_domains": domains,
        "conversation": history[-12:],
        "conversation_state": {
            "current_message_has_priority": True,
            "recent_media_invite": _recent_media_invite(history),
            "image_attached": bool(image_url),
            "last_assistant_message": _last_assistant_text(history),
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
    if settings.realtime_reasoning_model.lower().startswith("gpt-5"):
        body["reasoning_effort"] = "none"

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
