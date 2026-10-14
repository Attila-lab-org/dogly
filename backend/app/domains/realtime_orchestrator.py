"""Grounded turn orchestration for DOGly Realtime.

The language model verbalizes a governed decision. It is not the personal
memory, the safety layer, or a source of dog facts.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError

from app.config import Settings
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.realtime import RealtimeDecision, RealtimeDomain
from app.domains.owner_stories import extract_owner_reported_facts
from app.domains.realtime_context import (
    CONVERSATION_MESSAGE_LIMIT,
    RealtimeDogContext,
    build_open_threads,
    situational_context_now,
)
from app.knowledge.claim_validation import (
    extract_claims_from_provider_payload,
    infer_claims_from_answer,
    validate_claims,
)
from app.knowledge.product_instruction import PRODUCT_INSTRUCTION
from app.knowledge.spoken_style import DOGLY_SPOKEN_STYLE

REALTIME_ORCHESTRATOR_VERSION = "realtime-orchestrator/v7"
REALTIME_HISTORY_LIMIT = CONVERSATION_MESSAGE_LIMIT

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

_DIGESTIVE_MEDIA_TERMS = {
    "cacca", "feci", "diarrea", "vomito", "vomitato", "pupù", "pupu",
    "escrementi",
}


def _attachment_focus(
    *,
    user_text: str,
    media_context: str | None,
    domains: list[RealtimeDomain],
) -> str:
    """Give the provider a narrow hint when the owner names the media subject."""
    words = set(
        re.findall(
            r"[\wÀ-ÖØ-öø-ÿ]+",
            f"{user_text} {media_context or ''}".casefold(),
        )
    )
    if words & _DIGESTIVE_MEDIA_TERMS or "DIGESTIVE" in domains:
        return "DIGESTIVE_STOOL"
    if "BEHAVIOR" in domains:
        return "BEHAVIOR"
    return "GENERAL"
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


# Chat Ask: frontier model owns canine knowledge; server only supplies THIS dog.
_SYSTEM = (
    PRODUCT_INSTRUCTION
    + "\n\n"
    + DOGLY_SPOKEN_STYLE
    + """

Per questo turno di chat:
Usa liberamente la tua conoscenza generale su cani, razze, salute, comportamento e
digestione: non ti serve un catalogo interno di knowledge cards.
Personalizza solo con PERSONAL_DOG_CONTEXT (identità, fatti, evidenze, cronologia,
open_threads, situational_context): non inventare fatti su QUESTO cane.
Se identity.breed_label è presente, usala come riferimento primario di razza.
Se open_threads non è vuoto e il messaggio è un saluto o una ripresa generica,
riprendi il filo in modo naturale — sia momenti difficili sia belle notizie
(tone concern|positive|neutral); se parla di altro, non forzare il check-in.
situational_context.season_northern: usala solo se cambia davvero la lettura.
Con una foto (anche feci o altro): osserva ciò che appare davvero e dai una lettura
chiara e utile, collegata al profilo quando pertinente.
memory_candidate: al massimo un fatto stabile utile da ricordare, altrimenti null
(niente episodi monouso tipo "oggi").
suggest_food_review: true solo se ripassare l'alimento attuale è utile ora.
suggest_save_to_moments: true se la foto è un bel ricordo del cane, non un'analisi
(es. feci / campione clinico).
Rispondi al turno corrente. Restituisci il JSON richiesto; action_options risponde
alla sola domanda del turno. Azioni photo/video solo se quel media cambia davvero
la lettura; nessun link inventato. used_source_ids cita solo dati personali forniti.
"""
)


def _uses_reasoning_effort(model: str) -> bool:
    name = model.lower()
    return name.startswith("gpt-5") or name.startswith("gpt-6")


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
            "memory_candidate",
            "suggest_food_review",
            "suggest_save_to_moments",
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
            "memory_candidate": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "required": ["statement", "category"],
                "properties": {
                    "statement": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "ROUTINE",
                            "PREFERENCE",
                            "DIET",
                            "HEALTH",
                            "GENERAL",
                        ],
                    },
                },
            },
            "suggest_food_review": {"type": "boolean"},
            "suggest_save_to_moments": {"type": "boolean"},
        },
    }


def memory_candidate_from_provider(raw: dict[str, Any] | None) -> dict[str, str] | None:
    """Accept an optional GPT memory hint; never invent one server-side here."""
    if not isinstance(raw, dict):
        return None
    candidate = raw.get("memory_candidate")
    if not isinstance(candidate, dict):
        return None
    statement = " ".join(str(candidate.get("statement") or "").split()).strip(" .,:;-")
    category = str(candidate.get("category") or "").upper()
    if not statement or len(statement) > 240:
        return None
    if category not in {"ROUTINE", "PREFERENCE", "DIET", "HEALTH", "GENERAL"}:
        return None
    if any(marker in statement.casefold() for marker in _EPISODIC_MARKERS):
        return None
    return {"statement": statement, "category": category}

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
            memory_candidate=memory_candidate_from_provider(raw),
            suggest_food_review=bool(raw.get("suggest_food_review")),
            suggest_save_to_moments=bool(raw.get("suggest_save_to_moments")),
            claims=extract_claims_from_provider_payload(raw),
        )
    except (TypeError, ValidationError):
        return None


def _last_assistant_text(history: list[dict[str, Any]]) -> str | None:
    return next((
        item["content"] for item in reversed(history)
        if item.get("role") == "assistant" and item.get("content", "").strip()
    ), None)


def _last_user_text(history: list[dict[str, Any]]) -> str | None:
    return next((
        item["content"] for item in reversed(history)
        if item.get("role") == "user" and item.get("content", "").strip()
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


def _select_realtime_reasoning_effort(
    settings: Settings,
    *,
    user_text: str,
    domains: list[RealtimeDomain],
    context: RealtimeDogContext,
    history: list[dict[str, Any]],
    image_attached: bool,
) -> str:
    """Choose effort from bounded structural signals; config remains an override."""
    if settings.realtime_reasoning_effort:
        return settings.realtime_reasoning_effort

    complexity = 0
    if len(user_text.strip()) > 180 or len(history) >= 4:
        complexity += 1
    if len(domains) >= 2 or len(context.items) >= 3:
        complexity += 1
    if len(history) >= 8 or len(domains) >= 3 or len(context.items) >= 6:
        complexity += 1
    if image_attached:
        # Multimodal turns (es. foto feci) meritano sempre ragionamento pieno.
        return "high"
    return "high" if complexity >= 3 else "medium" if complexity else "low"


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
    breed = str((context.identity or {}).get("breed_label") or "").strip()
    breed_bit = f" e di un {breed}" if breed else ""
    return RealtimeDecision(
        assistant_text=(
            f"Posso ragionare su {name} con quello che so dei cani{breed_bit}; "
            "raccontami cosa sta succedendo adesso e lo collego al suo profilo."
        ),
        question=f"Cosa hai notato in {name}?",
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
        if settings.app_env != "local":
            raise ApiError(ErrorCode.PROCESSING_FAILED, "DOGly non riesce a rispondere ora. Riprova.", retryable=True)
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
    attachment_focus = _attachment_focus(
        user_text=user_text,
        media_context=media_context,
        domains=domains,
    )
    open_threads = build_open_threads(
        dog_name=context.dog_name,
        previous_turns=history,
        evidence_items=list(context.items),
    )
    payload = {
        "personal_dog_context": {
            "dog_id": context.dog_id,
            "dog_name": context.dog_name,
            "identity": context.identity,
            "core_facts": context.core_facts,
            "retrieved_personal_facts": context.stable_facts,
            "relevant_evidence": [item.model_dump(mode="json") for item in context.items],
            "open_threads": open_threads,
            "situational_context": situational_context_now(),
            "missing": context.missing,
        },
        "context_contract": "personal-dog-core-plus-evidence/v2",
        "conversation": recent_history,
        "conversation_state": {
            "current_message_has_priority": True,
            # Media metadata is server-owned turn state; keep it from the
            # original history because the GPT context projection strips it.
            "recent_media_invite": _recent_media_invite(history),
            "image_attached": bool(image_url),
            "attachment_focus": attachment_focus if image_url else None,
            "last_user_message": _last_user_text(recent_history),
            "last_assistant_message": _last_assistant_text(recent_history),
            "instruction": "Riconosci cambi di significato, correzioni e risposte già date; non ripartire dalla vecchia analisi.",
        },
        "owner_turn": user_text,
        "owner_media_context": media_context,
    }
    # SQLAlchemy returns UUID/date values from the dog context. Normalize the
    # complete provider payload before serializing it so media turns cannot
    # fail with a server-side JSON encoding error.
    payload = jsonable_encoder(payload)
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
    if _uses_reasoning_effort(settings.realtime_reasoning_model):
        body["reasoning_effort"] = _select_realtime_reasoning_effort(
            settings,
            user_text=user_text,
            domains=domains,
            context=context,
            history=history,
            image_attached=bool(image_url),
        )

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
    except (httpx.HTTPError, ValueError) as exc:
        if settings.app_env != "local":
            raise ApiError(ErrorCode.PROCESSING_FAILED, "DOGly non riesce a rispondere ora. Riprova.", retryable=True) from exc
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
        if settings.app_env != "local":
            raise ApiError(ErrorCode.PROVIDER_SCHEMA_INVALID, "La risposta non è disponibile. Riprova.", retryable=True)
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
