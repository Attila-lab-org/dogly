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

DIGESTIVE_REASONING_VERSION = "digestive-reasoning/v8"
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
    knowledge_claim_ids: list[str] = Field(default_factory=list)
    knowledge_registry_version: str | None = None
    knowledge_registry_checksum: str | None = None
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


def _owner_context_used(context: DigestiveContext) -> bool:
    return any(
        value is not None and value != ""
        for value in (
            context.vomiting_today,
            context.reduced_activity_today,
            context.appetite_reduced,
            context.straining_or_urgency,
            context.unusual_food_48h,
            context.supplements_or_medication,
            context.food_started_days_ago,
            context.quantity_per_day,
            context.latest_weight_kg,
            context.weight_delta_kg,
            context.active_food_name,
        )
    )


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
        started = "l’alimento iniziato oggi"
    elif days == 1:
        started = "l’alimento iniziato ieri"
    else:
        started = f"l’alimento iniziato da {days} giorni"
    return f"Il cambiamento coincide temporalmente con {started}."


def _food_stability_phrase(context: DigestiveContext) -> str | None:
    if not _food_known(context) or context.food_started_days_ago is None:
        return None
    days = context.food_started_days_ago
    if days <= 7:
        return None
    if days >= 60:
        months = max(days // 30, 2)
        if months == 2:
            return "Il cibo è lo stesso da due mesi"
        return f"Il cibo è lo stesso da {months} mesi"
    if days == 1:
        return "Il cibo è lo stesso da ieri"
    return f"Il cibo è lo stesso da {days} giorni"


def _repetition_phrase(context: DigestiveContext, consistency: str) -> str | None:
    if context.episode_count_7d >= 1 and consistency in {
        "soft",
        "unformed",
        "watery",
    }:
        return "È la seconda volta questa settimana."
    if context.recent_watery_count_24h >= 1 or context.recent_episode_count_24h >= 1:
        return "È la seconda volta in poche ore."
    return None


def _owner_negative_phrase(context: DigestiveContext) -> str | None:
    missing: list[str] = []
    if context.vomiting_today is False:
        missing.append("vomito")
    if context.appetite_reduced is False:
        missing.append("appetito ridotto")
    if context.reduced_activity_today is False:
        missing.append("attività ridotta")
    if not missing:
        return None
    if len(missing) == 1:
        return f"non risulta {missing[0]}"
    if len(missing) == 2:
        return f"non risultano {missing[0]} o {missing[1]}"
    return "non risultano vomito, appetito ridotto o attività ridotta"


def _weight_phrase(context: DigestiveContext) -> str | None:
    if context.weight_delta_kg is None or abs(context.weight_delta_kg) < 1.0:
        return None
    direction = "perso" if context.weight_delta_kg < 0 else "preso"
    return (
        f"{context.dog_name} ha {direction} circa "
        f"{abs(context.weight_delta_kg):.1f} kg nel diario del peso"
    )


def _useful_info(
    *,
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    safety: DigestiveState,
    observation: dict[str, Any],
) -> str:
    if verification_unavailable(observation):
        return (
            "Non riesco a confermare bene questo dettaglio dalla foto. "
            f"{unavailable_caution_detail(observation)}"
        )
    if safety is DigestiveState.VET_CONTACT:
        return "C’è un segnale che merita una valutazione professionale."

    sentences: list[str] = []
    repetition = _repetition_phrase(context, consistency)
    if repetition:
        sentences.append(repetition)

    second_bits: list[str] = []
    if _recent_food_change(context):
        second_bits.append(_food_started_sentence(context).rstrip("."))
    else:
        stable = _food_stability_phrase(context)
        if stable:
            second_bits.append(stable)
    owner = _owner_negative_phrase(context)
    if owner:
        if second_bits:
            second_bits.append(owner)
        else:
            second_bits.append(owner.capitalize() if owner[:1].islower() else owner)
    weight = _weight_phrase(context)
    if weight and not second_bits and not sentences:
        second_bits.append(weight)

    if second_bits:
        if len(second_bits) == 1:
            fragment = second_bits[0]
        else:
            fragment = f"{second_bits[0]} e {second_bits[1]}"
        if not fragment.endswith("."):
            fragment = f"{fragment}."
        sentences.append(fragment)

    if baseline_code == "INSUFFICIENT" and len(sentences) < 2:
        sentences.append(
            f"Sto ancora imparando il solito digestivo di {context.dog_name}."
        )
    if not sentences:
        if baseline_code == "NEAR_USUAL":
            return "Niente di diverso dalle ultime osservazioni."
        if baseline_code == "ABOVE_USUAL":
            return "È un cambiamento rispetto alle ultime osservazioni."
        if baseline_code == "BELOW_USUAL":
            return "È un cambiamento rispetto alle ultime osservazioni."
        return "Per ora niente altro da aggiungere."
    return " ".join(sentences[:2])


def _consumer_headline(
    *,
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    safety: DigestiveState,
    observation: dict[str, Any],
) -> str:
    if safety is DigestiveState.VET_CONTACT:
        return "È prudente sentire il veterinario"
    if verification_unavailable(observation):
        return "Non riesco a confermare un dettaglio"
    if safety is DigestiveState.ATTENTION:
        return "C’è qualcosa da tenere d’occhio"
    if baseline_code == "ABOVE_USUAL":
        return "Più morbide del suo solito"
    if baseline_code == "BELOW_USUAL":
        return "Più compatte del suo solito"
    if baseline_code == "NEAR_USUAL":
        return "In linea con il suo solito"
    if consistency == "watery":
        return "Più liquide"
    if consistency in {"soft", "unformed"}:
        return "Più morbide"
    if consistency == "formed":
        return "Prima osservazione utile"
    return f"Ecco cosa noto oggi per {context.dog_name}"


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

    if state is DigestiveState.ATTENTION and context.reduced_activity_today is None:
        return (
            DigestiveUsefulAction(key="ask_followup"),
            "reduced_activity_today",
            f"{context.dog_name} appare meno attivo del solito?",
        )

    if not _food_known(context):
        return (
            DigestiveUsefulAction(
                key="add_nutrition",
                label="Aggiungi",
                href=NUTRITION_HREF,
                title="Alimentazione non impostata",
            ),
            None,
            None,
        )
    if _food_known(context) and not _has_quantity(context):
        return (
            DigestiveUsefulAction(
                key="complete_nutrition",
                label="Completa",
                href=_complete_nutrition_href(context),
                title="Quantità non impostata",
            ),
            None,
            None,
        )
    if followup_key and followup_question:
        return (
            DigestiveUsefulAction(key="ask_followup"),
            followup_key,
            followup_question,
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
    baseline_code, _ = _baseline(context, score)
    safety = _safety_state(observation, context)

    if safety is DigestiveState.VET_CONTACT:
        state = safety
    elif verification_unavailable(observation):
        state = DigestiveState.MONITOR
    elif safety is DigestiveState.ATTENTION:
        state = safety
    elif baseline_code in {"ABOVE_USUAL", "BELOW_USUAL"}:
        state = DigestiveState.MONITOR
    elif baseline_code == "NEAR_USUAL" or (
        baseline_code == "INSUFFICIENT" and consistency == "formed"
    ):
        state = DigestiveState.ROUTINE
    elif consistency in {"soft", "unformed", "watery"} or (
        score is not None and score >= 4
    ):
        state = DigestiveState.MONITOR
    else:
        state = DigestiveState.ROUTINE

    headline = _consumer_headline(
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        safety=safety,
        observation=observation,
    )
    summary = _useful_info(
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        safety=safety,
        observation=observation,
    )

    relevant_context: list[str] = []
    if observed_summary:
        relevant_context.append(observed_summary)
    if context.active_food_name:
        relevant_context.append(f"Alimento registrato: {context.active_food_name}.")
    if context.has_active_food and _has_quantity(context) and context.quantity_per_day:
        relevant_context.append(f"Quantità indicata: {context.quantity_per_day}.")

    associations: list[str] = []
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
        followup_key=followup_key,
        followup_question=followup_question,
    )

    if useful_action.key == "contact_vet":
        next_step = "Contatta il veterinario e descrivi ciò che hai osservato."
    elif useful_action.key in {"add_nutrition", "complete_nutrition"}:
        next_step = useful_action.title or useful_action.label or ""
    elif useful_action.key == "ask_followup":
        next_step = followup_question or ""
    else:
        next_step = "Per ora va bene così."

    knowledge = retrieve_digestive_knowledge(
        observation,
        state=state.value,
        safety_state=safety.value,
        has_food_context=_food_known(context),
        quantity_present=bool(context.quantity_per_day),
        food_started_days_ago=context.food_started_days_ago,
        prior_score_count=len(context.prior_scores),
        recent_episode_count_24h=context.recent_episode_count_24h,
        recent_watery_count_24h=context.recent_watery_count_24h,
        episode_count_7d=context.episode_count_7d,
        episode_count_30d=context.episode_count_30d,
        watery_count_7d=context.watery_count_7d,
        vomiting_today=context.vomiting_today,
        reduced_activity_today=context.reduced_activity_today,
        appetite_reduced=context.appetite_reduced,
        straining_or_urgency=context.straining_or_urgency,
        unusual_food_48h=context.unusual_food_48h,
        supplements_or_medication=context.supplements_or_medication,
        weight_present=(
            context.latest_weight_kg is not None or context.weight_delta_kg is not None
        ),
        owner_context_used=_owner_context_used(context),
    )

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
        knowledge_references=knowledge.references,
        knowledge_claim_ids=knowledge.claim_ids,
        knowledge_registry_version=knowledge.registry_version,
        knowledge_registry_checksum=knowledge.checksum,
    )
