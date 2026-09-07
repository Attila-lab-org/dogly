"""Deterministic Digestive Intelligence V2.

The vision model only describes the image. This module combines that
observation with the dog's prior baseline and verified context, then chooses
the consumer state and next step without allowing generated text to lower a
safety escalation.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.knowledge.digestive import (
    DigestiveKnowledgeReference,
    retrieve_digestive_knowledge,
)

DIGESTIVE_REASONING_VERSION = "digestive-reasoning/v1"
DIGESTIVE_BASELINE_VERSION = "digestive-baseline/v1"


class DigestiveState(StrEnum):
    ROUTINE = "ROUTINE"
    MONITOR = "MONITOR"
    ATTENTION = "ATTENTION"
    VET_CONTACT = "VET_CONTACT"


class DigestiveContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dog_name: str
    age_stage: str | None = None
    size: str | None = None
    weight_kg: float | None = None
    active_food_name: str | None = None
    food_started_days_ago: int | None = Field(default=None, ge=0)
    prior_scores: list[int] = Field(default_factory=list)
    prior_consistencies: list[str] = Field(default_factory=list)
    recent_episode_count_24h: int = Field(default=0, ge=0)
    vomiting_today: bool | None = None
    reduced_activity_today: bool | None = None
    unusual_food_48h: bool | None = None


class DigestiveIntelligenceResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = "digestive_intelligence.v1"
    overall_state: DigestiveState
    consumer_headline: str
    consumer_summary: str
    baseline_comparison: str
    relevant_context: list[str] = Field(default_factory=list)
    possible_associations: list[str] = Field(default_factory=list)
    safety_state: DigestiveState
    recommended_next_step: str
    followup_key: str | None = None
    followup_question: str | None = None
    what_to_watch: list[str] = Field(default_factory=list)
    observation_reliability: str
    knowledge_references: list[DigestiveKnowledgeReference] = Field(
        default_factory=list
    )
    reasoning_version: str = DIGESTIVE_REASONING_VERSION
    baseline_version: str = DIGESTIVE_BASELINE_VERSION


def _candidate(observation: dict[str, Any], field: str) -> str:
    return str(observation.get(field) or "unknown").lower()


def _baseline(context: DigestiveContext, score: int | None) -> tuple[str, str]:
    if score is None or len(context.prior_scores) < 3:
        return (
            "INSUFFICIENT",
            f"Sto ancora costruendo il normale digestivo di {context.dog_name}.",
        )
    rolling = sum(context.prior_scores) / len(context.prior_scores)
    if score > rolling + 0.75:
        return (
            "ABOVE_USUAL",
            f"È più morbida rispetto alle osservazioni recenti di {context.dog_name}.",
        )
    if score < rolling - 0.75:
        return (
            "BELOW_USUAL",
            f"È più compatta rispetto alle osservazioni recenti di {context.dog_name}.",
        )
    return (
        "NEAR_USUAL",
        f"È simile alle osservazioni recenti di {context.dog_name}.",
    )


def _safety_state(
    observation: dict[str, Any], context: DigestiveContext
) -> DigestiveState:
    blood = _candidate(observation, "fresh_blood_candidate")
    melena = _candidate(observation, "melena_candidate")
    foreign = _candidate(observation, "foreign_material_candidate")
    consistency = str(observation.get("consistency") or "unknown").lower()

    if blood == "clear_candidate" or melena == "clear_candidate":
        return DigestiveState.VET_CONTACT
    if (
        consistency == "watery"
        and context.recent_episode_count_24h >= 2
        and context.vomiting_today is True
    ):
        return DigestiveState.VET_CONTACT
    if (
        blood == "possible"
        or melena == "possible"
        or foreign == "clear_candidate"
    ):
        return DigestiveState.ATTENTION
    recent_watery = sum(value.lower() == "watery" for value in context.prior_consistencies[-3:])
    if consistency == "watery" and recent_watery >= 1:
        return DigestiveState.ATTENTION
    if consistency in {"unformed", "watery"} and (
        context.vomiting_today is True or context.reduced_activity_today is True
    ):
        return DigestiveState.ATTENTION
    return DigestiveState.ROUTINE


def build_digestive_intelligence(
    observation: dict[str, Any], context: DigestiveContext
) -> DigestiveIntelligenceResult:
    """Build a bounded consumer result from observed and persisted facts only."""

    score_raw = observation.get("fecal_score_estimate")
    score = int(score_raw) if isinstance(score_raw, int | float) else None
    consistency = str(observation.get("consistency") or "unknown").lower()
    baseline_code, baseline_text = _baseline(context, score)
    safety = _safety_state(observation, context)

    if safety is DigestiveState.VET_CONTACT:
        state = safety
        headline = "È prudente sentire il veterinario"
        summary = "Nella foto noto un segnale che merita una valutazione professionale."
        next_step = "Contatta il veterinario e descrivi ciò che hai osservato."
    elif safety is DigestiveState.ATTENTION:
        state = safety
        headline = "C’è qualcosa da tenere d’occhio"
        summary = "Questa osservazione merita più attenzione del solito."
        next_step = "Controlla come sta e registra la prossima evacuazione."
    elif baseline_code == "ABOVE_USUAL":
        state = DigestiveState.MONITOR
        headline = f"Oggi sembrano più morbide del solito di {context.dog_name}"
        summary = "Il cambiamento è utile da monitorare, senza attribuirgli una causa."
        next_step = "Controlla la prossima evacuazione."
    elif baseline_code == "BELOW_USUAL":
        state = DigestiveState.MONITOR
        headline = f"Oggi sembrano più compatte del solito di {context.dog_name}"
        summary = "Il cambiamento è utile da monitorare nel tempo."
        next_step = "Controlla la prossima evacuazione."
    elif baseline_code == "NEAR_USUAL":
        state = DigestiveState.ROUTINE
        headline = f"Oggi sono simili al solito di {context.dog_name}"
        summary = baseline_text
        next_step = "Continua a osservare normalmente."
    elif consistency in {"soft", "unformed", "watery"} or (score is not None and score >= 4):
        state = DigestiveState.MONITOR
        headline = f"Oggi le feci di {context.dog_name} sembrano più morbide"
        summary = baseline_text
        next_step = "Controlla la prossima evacuazione."
    else:
        state = DigestiveState.ROUTINE
        headline = f"Oggi sono simili al solito di {context.dog_name}"
        summary = baseline_text
        next_step = "Continua a osservare normalmente."

    relevant_context: list[str] = []
    associations: list[str] = []
    if context.active_food_name:
        relevant_context.append(f"Alimento registrato: {context.active_food_name}.")
    if (
        context.food_started_days_ago is not None
        and context.food_started_days_ago <= 7
    ):
        associations.append(
            f"L’alimento è stato iniziato {context.food_started_days_ago} giorni fa: "
            "la vicinanza temporale è utile da monitorare, ma non indica una causa."
        )
    if context.unusual_food_48h is True:
        associations.append(
            "Hai segnalato qualcosa di insolito mangiato nelle ultime 48 ore. "
            "È un contesto utile, non una causa accertata."
        )

    limitations = observation.get("warnings") or []
    reliability = (
        "La foto permette una lettura utile, con alcuni limiti: "
        + "; ".join(str(item) for item in limitations[:2])
        if limitations
        else "La foto permette di valutare forma, consistenza e colore apparente."
    )

    followup = None
    followup_key = None
    if consistency in {"unformed", "watery"} and context.vomiting_today is None:
        followup_key = "vomiting_today"
        followup = f"{context.dog_name} ha vomitato oggi?"
    elif state is DigestiveState.ATTENTION and context.reduced_activity_today is None:
        followup_key = "reduced_activity_today"
        followup = f"{context.dog_name} appare meno attivo del solito?"

    return DigestiveIntelligenceResult(
        overall_state=state,
        consumer_headline=headline,
        consumer_summary=summary,
        baseline_comparison=baseline_code,
        relevant_context=relevant_context,
        possible_associations=associations,
        safety_state=safety,
        recommended_next_step=next_step,
        followup_key=followup_key,
        followup_question=followup,
        what_to_watch=["vomito", "riduzione dell’attività", "nuovi episodi ravvicinati"],
        observation_reliability=reliability,
        knowledge_references=retrieve_digestive_knowledge(
            has_food_context=context.active_food_name is not None,
            needs_clinical_context=(
                state in {DigestiveState.ATTENTION, DigestiveState.VET_CONTACT}
                or consistency in {"unformed", "watery"}
            ),
        ),
    )
