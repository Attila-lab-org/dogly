"""Deterministic Digestive Intelligence V2.

The vision model only describes the image. This module combines that
observation with the dog's prior baseline and verified context, then chooses
the consumer state and a single useful next action without allowing generated
text to lower a safety escalation.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domains.digestive_observation import (
    observation_summary,
    prepare_digestive_observation,
)
from app.domains.digestive_verification import (
    safety_candidate,
    unavailable_caution_detail,
    verification_unavailable,
)
from app.knowledge.digestive import (
    DigestiveKnowledgeReference,
    retrieve_digestive_knowledge,
)

DIGESTIVE_REASONING_VERSION = "digestive-reasoning/v6"
DIGESTIVE_BASELINE_VERSION = "digestive-baseline/v2"
NUTRITION_HREF = "/nutrition/foods"

UsefulActionKey = Literal[
    "contact_vet",
    "add_nutrition",
    "complete_nutrition",
    "ask_followup",
    "contextual",
    "none",
]


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
    active_food_product_id: str | None = None
    has_active_food: bool = False
    quantity_per_day: str | None = None
    food_started_days_ago: int | None = Field(default=None, ge=0)
    current_food_prior_scores: list[int] = Field(default_factory=list)
    previous_food_scores: list[int] = Field(default_factory=list)
    season_label: str | None = None
    same_season_prior_scores: list[int] = Field(default_factory=list)
    other_season_scores: list[int] = Field(default_factory=list)
    prior_scores: list[int] = Field(default_factory=list)
    prior_consistencies: list[str] = Field(default_factory=list)
    recent_episode_count_24h: int = Field(default=0, ge=0)
    recent_watery_count_24h: int = Field(default=0, ge=0)
    vomiting_today: bool | None = None
    reduced_activity_today: bool | None = None
    unusual_food_48h: bool | None = None
    episode_count_7d: int = Field(default=0, ge=0)
    episode_count_30d: int = Field(default=0, ge=0)
    watery_count_7d: int = Field(default=0, ge=0)
    watery_count_30d: int = Field(default=0, ge=0)
    appetite_reduced: bool | None = None
    straining_or_urgency: bool | None = None
    supplements_or_medication: bool | None = None
    latest_weight_kg: float | None = None
    weight_delta_kg: float | None = None


class DigestiveUsefulAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: UsefulActionKey = "none"
    label: str | None = None
    href: str | None = None
    title: str | None = None
    body: str | None = None


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
    useful_action: DigestiveUsefulAction = Field(
        default_factory=DigestiveUsefulAction
    )
    what_to_watch: list[str] = Field(default_factory=list)
    observation_reliability: str
    knowledge_references: list[DigestiveKnowledgeReference] = Field(
        default_factory=list
    )
    reasoning_version: str = DIGESTIVE_REASONING_VERSION
    baseline_version: str = DIGESTIVE_BASELINE_VERSION


_QUALITY_COPY = {
    "filmed_screen": (
        "alcuni dettagli si perdono perché la foto non è stata scattata direttamente"
    ),
    "blurry": "la foto è un po’ sfocata",
    "motion_blur": "la foto è mossa",
    "too_dark": "c’è poca luce",
    "poor_lighting": "la luce non mostra bene i dettagli",
    "overexposed": "la luce è troppo forte",
    "too_far": "il soggetto è un po’ lontano",
    "too_close": "il soggetto è troppo ravvicinato",
    "occluded": "una parte importante non è visibile",
    "dog_not_visible": "il cane non si vede abbastanza bene",
    "audio_degraded": "l’audio non è abbastanza chiaro",
}


def _quality_phrase(item: object) -> str:
    raw = str(item).strip()
    key = raw.lower().replace(" ", "_").replace("-", "_")
    if key in _QUALITY_COPY:
        return _QUALITY_COPY[key]
    if " " in raw:
        return raw[0].lower() + raw[1:] if raw else raw
    return "alcuni dettagli non si vedono abbastanza bene"


def _observation_reliability(observation: dict[str, Any]) -> str:
    limitations = observation.get("warnings") or []
    phrases = [_quality_phrase(item) for item in limitations[:2]]
    if phrases:
        return "La foto mi permette di vedere alcune cose, ma " + " e ".join(
            phrases
        ) + "."
    return "La foto permette di valutare forma, consistenza e colore apparente."


def _has_quantity(context: DigestiveContext) -> bool:
    return bool(str(context.quantity_per_day or "").strip())


def _food_known(context: DigestiveContext) -> bool:
    return context.has_active_food or bool(context.active_food_name)


def _recent_food_change(context: DigestiveContext) -> bool:
    return (
        _food_known(context)
        and context.food_started_days_ago is not None
        and context.food_started_days_ago <= 7
    )


def _complete_nutrition_href(context: DigestiveContext) -> str:
    food_id = context.active_food_product_id
    if food_id:
        return f"/nutrition/foods/{food_id}/verify?focus=quantity"
    return NUTRITION_HREF


def _food_started_sentence(context: DigestiveContext) -> str:
    days = context.food_started_days_ago
    if days == 0:
        started = "Hai iniziato questo alimento oggi."
    elif days == 1:
        started = "Hai iniziato questo alimento da ieri."
    else:
        started = f"Hai iniziato questo alimento da {days} giorni."
    return (
        f"{started} Vediamo se la consistenza torna verso il suo solito "
        "nelle prossime osservazioni."
    )


def _baseline(context: DigestiveContext, score: int | None) -> tuple[str, str]:
    if score is None or len(context.prior_scores) < 3:
        return (
            "INSUFFICIENT",
            f"Sto ancora imparando il solito digestivo di {context.dog_name}.",
        )
    rolling = sum(context.prior_scores) / len(context.prior_scores)
    if score > rolling + 0.75:
        return (
            "ABOVE_USUAL",
            "Oggi è più morbida del solito.",
        )
    if score < rolling - 0.75:
        return (
            "BELOW_USUAL",
            "Oggi è più compatta del solito.",
        )
    return (
        "NEAR_USUAL",
        "È simile alle ultime volte.",
    )


def _directional_association(
    current: list[int],
    comparison: list[int],
    *,
    softer: str,
    firmer: str,
) -> str | None:
    """Describe a repeated difference without promoting correlation to cause."""
    if len(current) < 3 or len(comparison) < 3:
        return None
    delta = (sum(current) / len(current)) - (sum(comparison) / len(comparison))
    if delta >= 0.75:
        return softer
    if delta <= -0.75:
        return firmer
    return None


def _safety_state(
    observation: dict[str, Any], context: DigestiveContext
) -> DigestiveState:
    blood = safety_candidate(observation, "fresh_blood_candidate")
    melena = safety_candidate(observation, "melena_candidate")
    foreign = safety_candidate(observation, "foreign_material_candidate")
    consistency = str(observation.get("consistency") or "unknown").lower()

    if blood == "clear_candidate" or melena == "clear_candidate":
        return DigestiveState.VET_CONTACT
    if (
        consistency == "watery"
        and context.recent_watery_count_24h >= 1
        and context.vomiting_today is True
    ):
        return DigestiveState.VET_CONTACT
    if (
        blood == "possible"
        or melena == "possible"
        or foreign == "possible"
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
    if verification_unavailable(observation):
        return DigestiveState.MONITOR
    return DigestiveState.ROUTINE


def _visual_safety_action(observation: dict[str, Any]) -> bool:
    blood = safety_candidate(observation, "fresh_blood_candidate")
    melena = safety_candidate(observation, "melena_candidate")
    foreign = safety_candidate(observation, "foreign_material_candidate")
    return blood in {"possible", "clear_candidate"} or melena in {
        "possible",
        "clear_candidate",
    } or foreign == "clear_candidate"


def _choose_followup(
    consistency: str,
    state: DigestiveState,
    context: DigestiveContext,
) -> tuple[str | None, str | None]:
    if consistency in {"unformed", "watery"} and context.vomiting_today is None:
        return "vomiting_today", f"{context.dog_name} ha vomitato oggi?"
    if (
        consistency == "soft"
        and context.appetite_reduced is None
        and context.vomiting_today is None
        and state is DigestiveState.MONITOR
        and (context.recent_episode_count_24h >= 1 or context.episode_count_7d >= 2)
    ):
        return "vomiting_today", f"{context.dog_name} ha vomitato oggi?"
    if state is DigestiveState.ATTENTION and context.reduced_activity_today is None:
        return (
            "reduced_activity_today",
            f"{context.dog_name} appare meno attivo del solito?",
        )
    return None, None


def _choose_useful_action(
    *,
    observation: dict[str, Any],
    context: DigestiveContext,
    state: DigestiveState,
    safety: DigestiveState,
    baseline_code: str,
    followup_key: str | None,
    followup_question: str | None,
) -> tuple[DigestiveUsefulAction, str | None, str | None]:
    if safety is DigestiveState.VET_CONTACT or _visual_safety_action(observation):
        return (
            DigestiveUsefulAction(
                key="contact_vet",
                label="Contatta il veterinario",
                body="Descrivi al veterinario ciò che hai visto oggi.",
            ),
            None,
            None,
        )

    if verification_unavailable(observation):
        return (
            DigestiveUsefulAction(
                key="contact_vet",
                label="Contatta il veterinario",
                body=(
                    "Non riesco a confermare bene questo dettaglio dalla foto. "
                    f"{unavailable_caution_detail(observation)}"
                ),
            ),
            None,
            None,
        )

    consistency = str(observation.get("consistency") or "unknown").lower()
    if consistency in {"unformed", "watery"} and context.vomiting_today is None:
        return (
            DigestiveUsefulAction(key="ask_followup"),
            "vomiting_today",
            f"{context.dog_name} ha vomitato oggi?",
        )

    changed = state is DigestiveState.MONITOR or baseline_code in {
        "ABOVE_USUAL",
        "BELOW_USUAL",
    }
    if not _food_known(context) and state is not DigestiveState.ROUTINE:
        return (
            DigestiveUsefulAction(
                key="add_nutrition",
                label="Aggiungi alimentazione",
                href=NUTRITION_HREF,
                title="Mi manca una cosa utile",
                body=(
                    f"Non so ancora cosa mangia {context.dog_name}. "
                    "Se lo aggiungi posso capire meglio se i cambiamenti "
                    "digestivi coincidono con alimento, quantità o cambi recenti."
                ),
            ),
            None,
            None,
        )
    if (
        _food_known(context)
        and not _has_quantity(context)
        and state is not DigestiveState.ROUTINE
    ):
        return (
            DigestiveUsefulAction(
                key="complete_nutrition",
                label="Completa alimentazione",
                href=_complete_nutrition_href(context),
                title="Quanto ne mangia al giorno?",
                body=(
                    f"So cosa mangia {context.dog_name}, ma mi manca la quantità "
                    "giornaliera. Con quella posso confrontare meglio le prossime volte."
                ),
            ),
            None,
            None,
        )
    if changed and followup_key and followup_question:
        return (
            DigestiveUsefulAction(key="ask_followup"),
            followup_key,
            followup_question,
        )
    if (
        _food_known(context)
        and _has_quantity(context)
        and _recent_food_change(context)
        and state is DigestiveState.MONITOR
    ):
        return (
            DigestiveUsefulAction(
                key="contextual",
                body=_food_started_sentence(context),
            ),
            None,
            None,
        )
    return DigestiveUsefulAction(key="none"), None, None


def count_recent_windows(
    created_at,
    rows: list,
    *,
    consistency_of,
    created_of,
) -> dict[str, int]:
    counts = {
        "episode_count_7d": 0,
        "episode_count_30d": 0,
        "watery_count_7d": 0,
        "watery_count_30d": 0,
    }
    for row in rows:
        delta = (created_at - created_of(row)).total_seconds()
        if delta <= 7 * 86_400:
            counts["episode_count_7d"] += 1
            if consistency_of(row) == "watery":
                counts["watery_count_7d"] += 1
        if delta <= 30 * 86_400:
            counts["episode_count_30d"] += 1
            if consistency_of(row) == "watery":
                counts["watery_count_30d"] += 1
    return counts


def build_digestive_intelligence(
    observation: dict[str, Any],
    context: DigestiveContext,
    *,
    longitudinal: bool = False,
) -> DigestiveIntelligenceResult:
    """Build a bounded consumer result from observed and persisted facts only."""

    observation = prepare_digestive_observation(observation)
    score_raw = observation.get("fecal_score_estimate")
    score = int(score_raw) if isinstance(score_raw, int | float) else None
    consistency = str(observation.get("consistency") or "unknown").lower()
    observed_summary = observation_summary(observation, dog_name=context.dog_name)
    baseline_code, baseline_text = _baseline(context, score)
    safety = _safety_state(observation, context)

    extra = ""
    if context.recent_watery_count_24h >= 1 or (
        consistency in {"soft", "unformed", "watery"}
        and context.episode_count_7d >= 1
        and baseline_code == "ABOVE_USUAL"
    ):
        if context.episode_count_7d >= 1:
            extra = " È la seconda volta questa settimana."
        elif context.recent_episode_count_24h >= 1:
            extra = " È la seconda volta in poche ore."

    if safety is DigestiveState.VET_CONTACT:
        state = safety
        headline = "È prudente sentire il veterinario"
        summary = (
            f"{observed_summary} C’è un segnale che merita una valutazione "
            "professionale."
        )
    elif verification_unavailable(observation):
        state = DigestiveState.MONITOR
        headline = "Non riesco a confermare un dettaglio"
        summary = (
            "Non riesco a confermare bene questo dettaglio dalla foto. "
            f"{unavailable_caution_detail(observation)}"
        )
    elif safety is DigestiveState.ATTENTION:
        state = safety
        headline = "C’è qualcosa da tenere d’occhio"
        summary = f"{observed_summary} Meglio non lasciarlo passare."
    elif baseline_code == "ABOVE_USUAL":
        state = DigestiveState.MONITOR
        headline = "Più morbida del solito"
        summary = (
            f"{observed_summary} È un cambiamento rispetto alle ultime "
            f"osservazioni.{extra}"
        )
    elif baseline_code == "BELOW_USUAL":
        state = DigestiveState.MONITOR
        headline = "Più compatta del solito"
        summary = (
            f"{observed_summary} È un cambiamento rispetto alle ultime "
            f"osservazioni.{extra}"
        )
    elif baseline_code == "NEAR_USUAL":
        state = DigestiveState.ROUTINE
        headline = "In linea con il suo solito"
        summary = f"{observed_summary} È simile alle ultime volte."
    elif baseline_code == "INSUFFICIENT" and consistency == "formed":
        state = DigestiveState.ROUTINE
        headline = f"Le feci di {context.dog_name} appaiono ben formate"
        summary = f"{observed_summary} Sto ancora imparando il suo solito."
    elif consistency in {"soft", "unformed", "watery"} or (
        score is not None and score >= 4
    ):
        state = DigestiveState.MONITOR
        headline = f"Le feci di {context.dog_name} appaiono più morbide"
        summary = f"{observed_summary} {baseline_text}{extra}"
    else:
        state = DigestiveState.ROUTINE
        headline = f"Ecco cosa noto oggi per {context.dog_name}"
        summary = f"{observed_summary} {baseline_text}"

    relevant_context: list[str] = []
    associations: list[str] = []
    if context.active_food_name:
        relevant_context.append(f"Alimento registrato: {context.active_food_name}.")
    if context.has_active_food and _has_quantity(context) and context.quantity_per_day:
        relevant_context.append(f"Quantità indicata: {context.quantity_per_day}.")
    if _recent_food_change(context):
        associations.append(_food_started_sentence(context))
    if context.unusual_food_48h is True:
        associations.append(
            f"Hai segnalato qualcosa di insolito mangiato da {context.dog_name} "
            "nelle ultime 48 ore."
        )
    if longitudinal and context.episode_count_7d >= 3:
        associations.append(
            f"Negli ultimi 7 giorni hai registrato {context.episode_count_7d} "
            "osservazioni."
        )
    if longitudinal and context.watery_count_7d >= 2:
        associations.append(
            "Nelle osservazioni degli ultimi 7 giorni la consistenza è stata "
            "più liquida più di una volta."
        )
    if longitudinal and context.appetite_reduced is True:
        associations.append(f"Hai segnalato che {context.dog_name} ha mangiato meno.")
    if longitudinal and context.straining_or_urgency is True:
        associations.append("Hai segnalato sforzo o urgenza.")
    if (
        longitudinal
        and context.weight_delta_kg is not None
        and abs(context.weight_delta_kg) >= 1.0
    ):
        direction = "perso" if context.weight_delta_kg < 0 else "preso"
        associations.append(
            f"Nel diario del peso {context.dog_name} ha {direction} circa "
            f"{abs(context.weight_delta_kg):.1f} kg."
        )
    if score is not None and context.active_food_name:
        food_association = _directional_association(
            [*context.current_food_prior_scores, score],
            context.previous_food_scores,
            softer=(
                f"Con {context.active_food_name}, le osservazioni di questi giorni "
                "sono state spesso più morbide rispetto al periodo precedente."
            ),
            firmer=(
                f"Con {context.active_food_name}, le osservazioni di questi giorni "
                "sono state spesso più compatte rispetto al periodo precedente."
            ),
        )
        if food_association:
            associations.append(food_association)
    if score is not None and context.season_label:
        season_association = _directional_association(
            [*context.same_season_prior_scores, score],
            context.other_season_scores,
            softer=(
                f"Nel periodo {context.season_label}, le osservazioni raccolte sono "
                "state spesso più morbide rispetto agli altri periodi dell’anno."
            ),
            firmer=(
                f"Nel periodo {context.season_label}, le osservazioni raccolte sono "
                "state spesso più compatte rispetto agli altri periodi dell’anno."
            ),
        )
        if season_association:
            associations.append(season_association)

    reliability = _observation_reliability(observation)
    followup_key, followup_question = _choose_followup(consistency, state, context)
    useful_action, followup_key, followup_question = _choose_useful_action(
        observation=observation,
        context=context,
        state=state,
        safety=safety,
        baseline_code=baseline_code,
        followup_key=followup_key,
        followup_question=followup_question,
    )

    if useful_action.key == "contact_vet":
        next_step = "Contatta il veterinario e descrivi ciò che hai osservato."
    elif useful_action.key == "add_nutrition" or useful_action.key == "complete_nutrition":
        next_step = useful_action.body or ""
    elif useful_action.key == "ask_followup":
        next_step = followup_question or ""
    elif useful_action.key == "contextual":
        next_step = useful_action.body or ""
    else:
        next_step = "Per ora va bene così."

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
        followup_question=followup_question,
        useful_action=useful_action,
        what_to_watch=["vomito", "riduzione dell’attività", "nuovi episodi ravvicinati"],
        observation_reliability=reliability,
        knowledge_references=retrieve_digestive_knowledge(
            has_food_context=_food_known(context),
            needs_clinical_context=(
                state in {DigestiveState.ATTENTION, DigestiveState.VET_CONTACT}
                or consistency in {"unformed", "watery"}
            ),
        ),
    )
