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

DIGESTIVE_REASONING_VERSION = "digestive-reasoning/v2"
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


def _observation_summary(observation: dict[str, Any]) -> str:
    consistency = {
        "hard": "dura",
        "formed": "ben formata",
        "soft": "morbida",
        "unformed": "poco formata",
        "watery": "liquida",
    }.get(str(observation.get("consistency") or "").lower())
    color = {
        "brown": "marrone",
        "dark brown": "marrone scuro",
        "light brown": "marrone chiaro",
        "brown-green": "marrone-verde",
        "green": "verde",
        "yellow": "giallo",
        "orange": "arancione",
        "black": "nero",
        "red": "rossastro",
        "gray": "grigio",
        "grey": "grigio",
    }.get(str(observation.get("color") or "").lower())
    if consistency and color:
        return f"La consistenza appare {consistency} e il colore {color}."
    if consistency:
        return f"La consistenza appare {consistency}."
    if color:
        return f"Il colore appare {color}."
    return "La foto permette un confronto con le osservazioni precedenti."


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
    blood = _candidate(observation, "fresh_blood_candidate")
    melena = _candidate(observation, "melena_candidate")
    foreign = _candidate(observation, "foreign_material_candidate")
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
    return DigestiveState.ROUTINE


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

    score_raw = observation.get("fecal_score_estimate")
    score = int(score_raw) if isinstance(score_raw, int | float) else None
    consistency = str(observation.get("consistency") or "unknown").lower()
    observed_summary = _observation_summary(observation)
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
        headline = f"Oggi è un po’ più morbida del solito di {context.dog_name}"
        summary = (
            f"{observed_summary} Rispetto alle osservazioni recenti sono più morbide: "
            "una singola foto non basta a indicarne il motivo."
        )
        next_step = "Osserva la prossima evacuazione e verifica se il cambiamento si ripete."
    elif baseline_code == "BELOW_USUAL":
        state = DigestiveState.MONITOR
        headline = f"Oggi è un po’ più compatta del solito di {context.dog_name}"
        summary = (
            f"{observed_summary} Rispetto alle osservazioni recenti sono più compatte: "
            "vale la pena vedere se succede ancora."
        )
        next_step = "Osserva la prossima evacuazione; per ora non serve cambiare nulla."
    elif baseline_code == "NEAR_USUAL":
        state = DigestiveState.ROUTINE
        headline = f"Oggi è in linea con le ultime osservazioni di {context.dog_name}"
        summary = f"{observed_summary} È simile alle osservazioni recenti."
        next_step = "Non emerge un cambiamento da seguire in modo particolare."
    elif baseline_code == "INSUFFICIENT" and consistency == "formed":
        state = DigestiveState.ROUTINE
        headline = f"Le feci di {context.dog_name} appaiono ben formate"
        summary = (
            f"{observed_summary} Servono ancora alcune osservazioni per conoscere "
            "il suo andamento abituale."
        )
        next_step = "Continua a osservare senza modificare la sua routine per questa sola foto."
    elif consistency in {"soft", "unformed", "watery"} or (score is not None and score >= 4):
        state = DigestiveState.MONITOR
        headline = f"Le feci di {context.dog_name} appaiono più morbide"
        summary = f"{observed_summary} {baseline_text}"
        next_step = "Osserva la prossima evacuazione e nota come sta nel frattempo."
    else:
        state = DigestiveState.ROUTINE
        headline = f"Questa osservazione di {context.dog_name} non mostra cambiamenti evidenti"
        summary = f"{observed_summary} {baseline_text}"
        next_step = "Non emerge qualcosa da cambiare sulla base di questa sola foto."

    relevant_context: list[str] = []
    associations: list[str] = []
    if context.active_food_name:
        relevant_context.append(f"Alimento registrato: {context.active_food_name}.")
    if (
        context.active_food_name
        and context.food_started_days_ago is not None
        and context.food_started_days_ago <= 7
    ):
        when = (
            "oggi"
            if context.food_started_days_ago == 0
            else (
                "ieri"
                if context.food_started_days_ago == 1
                else f"{context.food_started_days_ago} giorni fa"
            )
        )
        associations.append(
            f"Hai indicato che il passaggio a {context.active_food_name} è iniziato "
            f"{when}. È un’informazione utile da seguire, ma non dimostra che "
            "l’alimento abbia causato questo cambiamento."
        )
        if state not in {
            DigestiveState.ATTENTION,
            DigestiveState.VET_CONTACT,
        }:
            next_step = (
                "Se il cambio è ancora in corso, prosegui gradualmente e annota "
                "anche quantità, premi e altri alimenti."
            )
    if context.unusual_food_48h is True:
        associations.append(
            "Hai segnalato qualcosa di insolito mangiato nelle ultime 48 ore. "
            "È un contesto utile, non una causa accertata."
        )
    if longitudinal and context.episode_count_7d >= 3:
        associations.append(
            f"Negli ultimi 7 giorni hai registrato {context.episode_count_7d} "
            "osservazioni. È un andamento da seguire, non una diagnosi."
        )
    if longitudinal and context.watery_count_7d >= 2:
        associations.append(
            "Nelle osservazioni degli ultimi 7 giorni la consistenza è stata "
            "più liquida più di una volta. Vale la pena annotare come sta "
            f"{context.dog_name} nel frattempo."
        )
    if longitudinal and context.appetite_reduced is True:
        associations.append(
            "Hai segnalato un appetito ridotto. È un contesto da tenere "
            "insieme a questa foto, non una causa."
        )
    if longitudinal and context.straining_or_urgency is True:
        associations.append(
            "Hai segnalato sforzo o urgenza. È un’informazione utile da "
            "condividere se la situazione non si normalizza."
        )
    if (
        longitudinal
        and context.weight_delta_kg is not None
        and abs(context.weight_delta_kg) >= 1.0
    ):
        direction = "perso" if context.weight_delta_kg < 0 else "preso"
        associations.append(
            f"Nel diario del peso {context.dog_name} ha {direction} circa "
            f"{abs(context.weight_delta_kg):.1f} kg. È un dato da osservare "
            "insieme al veterinario se il cambiamento continua, non una diagnosi."
        )
    if score is not None and context.active_food_name:
        food_association = _directional_association(
            [*context.current_food_prior_scores, score],
            context.previous_food_scores,
            softer=(
                f"Con {context.active_food_name}, le osservazioni registrate finora "
                "sono state spesso più morbide rispetto al periodo precedente. "
                "La coincidenza merita attenzione, ma non dimostra che sia la causa."
            ),
            firmer=(
                f"Con {context.active_food_name}, le osservazioni registrate finora "
                "sono state spesso più compatte rispetto al periodo precedente. "
                "La coincidenza merita attenzione, ma non dimostra che sia la causa."
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
                "state spesso più morbide rispetto agli altri periodi dell’anno. "
                "È un andamento da continuare a osservare, non una causa."
            ),
            firmer=(
                f"Nel periodo {context.season_label}, le osservazioni raccolte sono "
                "state spesso più compatte rispetto agli altri periodi dell’anno. "
                "È un andamento da continuare a osservare, non una causa."
            ),
        )
        if season_association:
            associations.append(season_association)

    reliability = _observation_reliability(observation)

    followup = None
    followup_key = None
    if consistency in {"unformed", "watery"} and context.vomiting_today is None:
        followup_key = "vomiting_today"
        if (
            context.recent_watery_count_24h >= 1
            or context.recent_episode_count_24h >= 1
        ):
            followup = (
                f"Questa è la seconda osservazione molto morbida nelle ultime 24 ore. "
                f"{context.dog_name} ha anche vomitato oggi?"
            )
        else:
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
