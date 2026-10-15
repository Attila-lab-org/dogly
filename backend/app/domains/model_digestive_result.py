"""One GPT reading for creation and clarification; GET never invokes a writer."""

from fastapi.encoders import jsonable_encoder
from pydantic import Field

from app.contracts.taxonomy import AnalysisDomain
from app.domains.digestive_intelligence import (
    DigestiveIntelligenceResult,
    DigestiveState,
    clamp_digestive_owner_copy,
    normalize_baseline_comparison,
)
from app.domains.realtime_context import (
    load_realtime_context_db,
    load_realtime_context_memory,
)
from app.providers.personal_reasoning import request_personal_json

VERSION = "gpt-personal-digestive/v1"


class ModelDigestiveResult(DigestiveIntelligenceResult):
    safety_flags: list[dict[str, str]] = Field(default_factory=list)



async def model_digestive_result(state, *, event, digestive_context):
    if state.engine is not None:
        personal = await load_realtime_context_db(state.engine, user_id=event.user_id,
            dog_id=event.dog_id, domains=["DIGESTIVE", "NUTRITION", "CARE"], user_text="feci digestione")
    else:
        personal = load_realtime_context_memory(state.store, dog_id=event.dog_id,
            domains=["DIGESTIVE", "NUTRITION", "CARE"], user_text="feci digestione")
    # Exclude this result's previous conclusion from the evidence. Supply it
    # explicitly below as the prior reading, never as an independent fact.
    personal.items = [item for item in personal.items if item.source_id != str(event.id)]
    payload = {
        "observation": (event.observation_json or {}).get("raw_observation") or event.observation_json,
        "observed_at": event.created_at,
        "personal_dog_context": personal.model_dump(mode="json"),
        "digestive_history": digestive_context.model_dump(mode="json"),
        "owner_clarifications": event.owner_context_json,
        "deterministic_safety_flags": event.safety_flags,
        "previous_reading": {
            key: value for key, value in (event.intelligence_json or {}).items()
            if key != "canine_intelligence"
        } or None,
        "output_schema": ModelDigestiveResult.model_json_schema(),
        "instruction": (
            "Interpreta le evidenze per il proprietario. "
            "consumer_headline: una sola frase breve (max ~12 parole), tono umano, "
            "senza termini medici (niente Bristol, retto, ano, microfessura, score). "
            "consumer_summary: max 2 frasi semplici su cosa vedi e cosa fare oggi. "
            "Scrivi come a un amico, non come un referto. "
            "Al massimo una domanda utile. "
            "Restituisci JSON conforme allo schema. "
            "baseline_comparison deve essere solo uno di: "
            "INSUFFICIENT, BELOW_USUAL, NEAR_USUAL, ABOVE_USUAL. "
            "useful_action.key deve essere none. "
            "followup_key può essere solo vomiting_today, reduced_activity_today, "
            "unusual_food_48h, appetite_reduced, straining_or_urgency, "
            "supplements_or_medication oppure null. "
            "Non richiedere chiarimenti già presenti e attuali."
        ),
    }
    payload = jsonable_encoder(payload)
    raw, usage = await request_personal_json(
        state.settings,
        task="Interpreta l'osservazione per questo cane, con parole semplici",
        payload=payload,
    )
    result = ModelDigestiveResult.model_validate(raw)
    result.reasoning_version = VERSION
    result.consumer_headline, result.consumer_summary = clamp_digestive_owner_copy(
        result.consumer_headline,
        result.consumer_summary,
    )
    # Contract field is an enum code; the model sometimes returns owner prose.
    result.baseline_comparison = (
        normalize_baseline_comparison(result.baseline_comparison) or "INSUFFICIENT"
    )
    # Safety evidence is a technical floor, while GPT still owns the wording,
    # explanation and follow-up question.
    severities = {str(flag.get("severity", "")).upper() for flag in event.safety_flags}
    if "HIGH" in severities:
        result.safety_state = DigestiveState.VET_CONTACT
        result.overall_state = DigestiveState.VET_CONTACT
    elif "MEDIUM" in severities and result.safety_state == DigestiveState.ROUTINE:
        result.safety_state = DigestiveState.ATTENTION
        result.overall_state = DigestiveState.ATTENTION
    # No generated URL can create a fake functional affordance.
    result.useful_action.key = "none"
    result.useful_action.href = None
    allowed_keys = {"vomiting_today", "reduced_activity_today", "unusual_food_48h", "appetite_reduced", "straining_or_urgency", "supplements_or_medication"}
    if result.followup_key not in allowed_keys:
        result.followup_key = None
    await state.cost_meter.record(usage=usage, operation="digestive.reason",
        domain=AnalysisDomain.DIGESTIVE, event_id=event.id, user_id=event.user_id)
    return result, {"provider": usage.provider, "model": usage.model, "request_id": usage.request_id,
                    "input": payload, "output": result.model_dump(mode="json")}
