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
    color_family_copy,
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

DIGESTIVE_REASONING_VERSION = "digestive-reasoning/v16"
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
    breed_label: str | None = None
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


class DigestiveInterpretationLayer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: Literal["general", "profile", "longitudinal"]
    title: str
    summary: str
    claim_ids: list[str] = Field(default_factory=list)
    factors_used: list[str] = Field(default_factory=list)


class DigestiveIntelligenceResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = "digestive_intelligence.v2"
    overall_state: DigestiveState
    consumer_headline: str
    consumer_summary: str
    baseline_comparison: str
    interpretation_layers: list[DigestiveInterpretationLayer] = Field(default_factory=list)
    relevant_context: list[str] = Field(default_factory=list)
    possible_associations: list[str] = Field(default_factory=list)
    safety_state: DigestiveState
    recommended_next_step: str | None = None
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


def _food_started_span(context: DigestiveContext) -> str | None:
    days = context.food_started_days_ago
    if days is None:
        return None
    if days == 0:
        return "oggi"
    if days == 1:
        return "ieri"
    return f"{days} giorni"


def _food_started_sentence(context: DigestiveContext) -> str:
    span = _food_started_span(context)
    if span == "oggi":
        started = "l’alimento iniziato oggi"
    elif span == "ieri":
        started = "l’alimento iniziato ieri"
    else:
        started = f"l’alimento iniziato da {span}"
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


_LOOSE = frozenset({"soft", "unformed", "watery"})
_FIRM = frozenset({"formed", "hard"})


def _similar_kind(consistency: str) -> frozenset[str]:
    if consistency == "watery":
        return frozenset({"watery"})
    if consistency in _LOOSE:
        return _LOOSE
    if consistency in _FIRM:
        return _FIRM
    if consistency and consistency != "unknown":
        return frozenset({consistency})
    return frozenset()


def _similar_prior_count(context: DigestiveContext, consistency: str) -> int:
    """Count prior events of the same kind. Never use total analysis volume."""

    if consistency == "watery":
        from_list = sum(
            str(item).lower() == "watery" for item in context.prior_consistencies
        )
        return max(
            from_list,
            context.watery_count_7d,
            context.recent_watery_count_24h,
            0,
        )
    kind = _similar_kind(consistency)
    if not kind:
        return 0
    return sum(str(item).lower() in kind for item in context.prior_consistencies)


def _similar_hours_count(context: DigestiveContext, consistency: str) -> int:
    """24h similarity is persisted only for watery events."""

    if consistency == "watery":
        return max(context.recent_watery_count_24h, 0)
    return 0


def _repetition_level(context: DigestiveContext, consistency: str) -> str | None:
    # Formed/hard repetition is stable routine, not a repeating change.
    if consistency in _FIRM:
        return None
    hours = _similar_hours_count(context, consistency)
    similar = _similar_prior_count(context, consistency)
    if hours >= 1:
        return "hours"
    if similar >= 2:
        return "trend"
    if similar == 1:
        return "once"
    return None


def _repetition_phrase(context: DigestiveContext, consistency: str) -> str | None:
    level = _repetition_level(context, consistency)
    if level == "hours":
        return "Questo tipo di cambiamento si è ripetuto nelle ultime ore."
    if level == "trend":
        return "Questo tipo di cambiamento si sta ripetendo."
    if level == "once":
        return "Un cambiamento di questo tipo si è già presentato."
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


def _is_loose(consistency: str) -> bool:
    return consistency in _LOOSE




def _is_puppy_stage(age_stage: str | None) -> bool:
    if not age_stage:
        return False
    raw = str(age_stage).strip().lower()
    if raw in {"puppy", "cucciolo", "pup"}:
        return True
    return raw.startswith("meno di 1")


def _is_large_size(size: str | None) -> bool:
    if not size:
        return False
    raw = str(size).strip().lower()
    return raw in {"large", "grande", "giant", "gigante", "xl"}


def _texture_phrase(consistency: str) -> str | None:
    if consistency == "watery":
        return "più liquide"
    if consistency in {"soft", "unformed"}:
        return "più morbide"
    if consistency == "hard":
        return "più compatte"
    if consistency == "formed":
        return "ben formate"
    return None


def _candidate_level(observation: dict[str, Any], field: str) -> str:
    return str(observation.get(field) or "").lower()


def _visual_safety_why(observation: dict[str, Any], name: str) -> str | None:
    blood = safety_candidate(observation, "fresh_blood_candidate")
    melena = safety_candidate(observation, "melena_candidate")
    foreign = safety_candidate(observation, "foreign_material_candidate")
    if blood == "clear_candidate":
        return (
            f"Nella foto di {name} c’è un segnale rosso che merita "
            "una valutazione professionale."
        )
    if melena == "clear_candidate":
        return (
            f"Nella foto di {name} il colore è molto scuro: va descritto "
            "al veterinario, senza trarne una conclusione da qui."
        )
    if blood == "possible":
        return (
            f"Nella foto di {name} c’è una possibile traccia rossa: "
            "la tratto con prudenza, non come una certezza."
        )
    if melena == "possible":
        return (
            f"Nella foto di {name} il colore è insolitamente scuro: "
            "non basta per una conclusione, ma non lo ignoro."
        )
    if foreign == "clear_candidate":
        return (
            f"Nella foto di {name} si vede qualcosa di insolito. "
            "Non è una conclusione, ma va tenuto presente."
        )
    if foreign == "possible":
        return (
            f"Nella foto di {name} c’è un dettaglio che non riconosco "
            "con certezza: non è un allarme da etichetta, ma non lo scarto."
        )
    return None


def _uncertain_visual_note(observation: dict[str, Any]) -> str | None:
    if _visual_safety_action(observation):
        return None
    mucus = _candidate_level(observation, "mucus_candidate")
    if mucus in {"possible", "clear_candidate"}:
        return (
            "Dalla foto c’è un possibile alone vischioso, ma da solo non cambia "
            "la lettura."
        )
    foreign = safety_candidate(observation, "foreign_material_candidate")
    if foreign == "possible_unverified" or _candidate_level(
        observation, "foreign_material_candidate"
    ) == "possible":
        return (
            "Nella foto c’è un possibile dettaglio insolito, ma non è abbastanza "
            "chiaro da cambiare la conclusione."
        )
    undigested = _candidate_level(observation, "undigested_food_candidate")
    if undigested in {"possible", "clear_candidate"}:
        return (
            "Si vedono possibili residui di alimento: da soli non dicono come sta "
            "digerendo."
        )
    return None


def _unusual_color_note(observation: dict[str, Any]) -> str | None:
    family = str(observation.get("color_family") or "").upper()
    if family in {"GREEN", "GREEN_BROWN", "YELLOW", "ORANGE", "PALE_GRAY"}:
        return (
            "Il colore è un po’ diverso dal marrone più comune, ma da solo "
            "non spiega il resto."
        )
    return None


def _owner_symptom_sentence(context: DigestiveContext) -> str | None:
    vomits = context.vomiting_today is True
    quieter = context.reduced_activity_today is True
    less_appetite = context.appetite_reduced is True
    if vomits and quieter:
        return (
            f"Hai segnalato vomito e che {context.dog_name} è meno attivo."
        )
    if vomits:
        return f"Hai segnalato che {context.dog_name} ha vomitato oggi."
    if quieter:
        return (
            f"Hai segnalato che {context.dog_name} è meno attivo del solito."
        )
    if less_appetite:
        return f"Hai segnalato che {context.dog_name} ha mangiato meno."
    if context.straining_or_urgency is True:
        return "Hai segnalato sforzo o urgenza durante l’evacuazione."
    return None


def _personal_factor(
    context: DigestiveContext,
    *,
    baseline_code: str,
    consistency: str,
) -> str | None:
    if context.vomiting_today is True:
        return f"Hai segnalato che {context.dog_name} ha vomitato oggi."
    if context.reduced_activity_today is True:
        return f"Hai segnalato che {context.dog_name} è meno attivo del solito."
    if context.appetite_reduced is True:
        return f"Hai segnalato che {context.dog_name} ha mangiato meno."
    if context.straining_or_urgency is True:
        return "Hai segnalato sforzo o urgenza durante l’evacuazione."
    if _recent_food_change(context):
        span = _food_started_span(context)
        if span == "oggi":
            started = "iniziato oggi"
        elif span == "ieri":
            started = "iniziato ieri"
        else:
            started = f"iniziato da {span}"
        return (
            f"Il cambiamento è comparso nei giorni successivi all’alimento "
            f"{started}: è una coincidenza temporale da seguire."
        )
    if (
        _food_known(context)
        and context.food_started_days_ago is not None
        and context.food_started_days_ago > 7
        and (
            baseline_code in {"ABOVE_USUAL", "BELOW_USUAL"}
            or _is_loose(consistency)
        )
    ):
        stable = _food_stability_phrase(context)
        if stable:
            return (
                f"{stable}, quindi non c’è un cambio recente che coincida "
                "con questo episodio."
            )
    if context.unusual_food_48h is True:
        return (
            f"Hai segnalato qualcosa di insolito mangiato da {context.dog_name} "
            "nelle ultime 48 ore."
        )
    weight = _weight_phrase(context)
    if weight:
        return f"{weight}."
    return None


def _why_sentences(
    *,
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    observation: dict[str, Any],
) -> list[str]:
    del observation
    name = context.dog_name
    texture = _texture_phrase(consistency)
    level = _repetition_level(context, consistency)
    sentences: list[str] = []

    if baseline_code == "ABOVE_USUAL" and texture or baseline_code == "BELOW_USUAL" and texture:
        first = f"Sono {texture} rispetto al suo andamento abituale"
    elif baseline_code == "NEAR_USUAL":
        first = f"Per {name} corrisponde al suo andamento abituale"
    elif texture:
        first = f"Le feci di {name} sono {texture}"
    else:
        first = f"Ho una nuova osservazione per {name}"

    if level == "hours":
        first = f"{first} e questo tipo di cambiamento si è ripetuto nelle ultime ore."
    elif level == "trend":
        first = f"{first} e il cambiamento si sta ripetendo."
    elif level == "once":
        first = f"{first} e un cambiamento di questo tipo si è già presentato."
    elif not first.endswith("."):
        first = f"{first}."
    sentences.append(first)

    if baseline_code == "INSUFFICIENT" and level or baseline_code == "INSUFFICIENT":
        sentences.append(
            "Questa lettura usa la qualità fecale canina generale; con più "
            "osservazioni potremo confrontarla con il suo andamento personale."
        )
    else:
        factor = _personal_factor(
            context, baseline_code=baseline_code, consistency=consistency
        )
        if factor and factor.rstrip(".") not in first:
            sentences.append(factor)

    unique: list[str] = []
    for item in sentences:
        if item not in unique:
            unique.append(item)
    return unique[:2]


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
    visual = _visual_safety_why(observation, context.dog_name)
    if safety is DigestiveState.VET_CONTACT:
        return visual or (
            f"C’è un segnale su {context.dog_name} che merita una "
            "valutazione professionale."
        )
    if visual and (
        safety is DigestiveState.ATTENTION or _visual_safety_action(observation)
    ):
        extra = _owner_symptom_sentence(context) or _repetition_phrase(
            context, consistency
        )
        if extra:
            return f"{visual} {extra}"
        return visual

    return " ".join(
        _why_sentences(
            context=context,
            consistency=consistency,
            baseline_code=baseline_code,
            observation=observation,
        )
    )


def _consumer_headline(
    *,
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    safety: DigestiveState,
    observation: dict[str, Any],
) -> str:
    level = _repetition_level(context, consistency)
    name = context.dog_name
    texture = _texture_phrase(consistency)
    if safety is DigestiveState.VET_CONTACT:
        return "È prudente sentire il veterinario"
    if verification_unavailable(observation):
        return "Non riesco a confermare un dettaglio"
    if safety is DigestiveState.ATTENTION and (
        _visual_safety_action(observation)
        or context.vomiting_today is True
        or context.reduced_activity_today is True
        or context.appetite_reduced is True
        or context.straining_or_urgency is True
    ):
        return "Un cambiamento da valutare con più attenzione"
    if level in {"hours", "trend"} and texture:
        if _is_loose(consistency):
            return f"La digestione di {name} non si è ancora stabilizzata"
        return f"La regolarità digestiva di {name} è da seguire"
    if baseline_code in {"ABOVE_USUAL", "BELOW_USUAL"} and texture:
        return f"Le feci di {name} sono {texture} rispetto al suo solito"
    if baseline_code == "NEAR_USUAL":
        if texture:
            return f"Le feci di {name} sono {texture}, in linea con il suo solito"
        return f"Il risultato di {name} è in linea con il suo solito"
    if texture:
        if _is_loose(consistency):
            return f"La digestione di {name} è da osservare oggi"
        return f"La regolarità digestiva di {name} è da osservare oggi"
    return f"Ecco il risultato di {name}"


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
    if consistency in _LOOSE and (
        context.vomiting_today is True
        or context.reduced_activity_today is True
        or context.appetite_reduced is True
    ):
        return DigestiveState.ATTENTION
    if (
        consistency in {"hard", "formed", "soft", "unformed", "watery"}
        and context.straining_or_urgency is True
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
    if (
        state is DigestiveState.ATTENTION
        and context.reduced_activity_today is None
        and context.vomiting_today is not True
        and context.appetite_reduced is not True
        and context.straining_or_urgency is not True
    ):
        return (
            "reduced_activity_today",
            f"{context.dog_name} appare meno attivo del solito?",
        )
    if (
        consistency in {"soft", "unformed", "watery"}
        and state in {DigestiveState.MONITOR, DigestiveState.ATTENTION}
        and context.vomiting_today is False
        and context.appetite_reduced is None
    ):
        return (
            "appetite_reduced",
            f"{context.dog_name} ha mangiato meno del solito?",
        )
    if consistency == "hard" and context.straining_or_urgency is None:
        return (
            "straining_or_urgency",
            f"{context.dog_name} ha mostrato sforzo o urgenza durante l’evacuazione?",
        )
    if (
        consistency in {"soft", "unformed", "watery"}
        and state in {DigestiveState.MONITOR, DigestiveState.ATTENTION}
        and context.vomiting_today is False
        and context.appetite_reduced is False
        and context.reduced_activity_today is False
        and context.unusual_food_48h is None
    ):
        return (
            "unusual_food_48h",
            f"{context.dog_name} ha mangiato qualcosa di diverso nelle ultime 48 ore?",
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

    if followup_key and followup_question:
        return (
            DigestiveUsefulAction(key="ask_followup"),
            followup_key,
            followup_question,
        )

    if not _food_known(context):
        return (
            DigestiveUsefulAction(
                key="add_nutrition",
                label="Aggiungi",
                href=NUTRITION_HREF,
                title="Alimentazione non impostata",
                body=(
                    f"Se aggiungi cosa mangia {context.dog_name}, "
                    "le prossime letture saranno più precise."
                ),
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
                body=(
                    f"Se completi la quantità, le prossime letture di "
                    f"{context.dog_name} saranno più precise."
                ),
            ),
            None,
            None,
        )
    return DigestiveUsefulAction(key="none"), None, None


def _final_advice(
    *,
    observation: dict[str, Any],
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    safety: DigestiveState,
    followup_question: str | None,
) -> str:
    name = context.dog_name
    if safety is DigestiveState.VET_CONTACT or _visual_safety_action(observation):
        return (
            f"Contatta il veterinario e descrivi ciò che hai visto oggi per {name}."
        )
    if verification_unavailable(observation):
        return (
            f"Se il dubbio resta, senti il veterinario e descrivi ciò che hai visto "
            f"sulla foto di {name}."
        )
    if followup_question:
        return followup_question
    if context.vomiting_today is True:
        return (
            f"Hai segnalato vomito: senti il veterinario se {name} non torna "
            "come prima o se peggiora."
        )
    if context.reduced_activity_today is True:
        return (
            f"Hai segnalato meno attività: senti il veterinario se {name} "
            "resta spento o se gli episodi continuano."
        )
    if context.appetite_reduced is True:
        return (
            f"Hai segnalato appetito ridotto: senti il veterinario se {name} "
            "continua a mangiare meno o se compaiono altri sintomi."
        )
    if context.straining_or_urgency is True:
        return (
            "Hai segnalato sforzo o urgenza: senti il veterinario se continua "
            f"o se {name} appare in difficoltà."
        )
    if safety is DigestiveState.ROUTINE and consistency == "formed":
        return (
            "Continua normalmente. Non serve modificare alimento o quantità "
            "sulla base di questa foto."
        )
    level = _repetition_level(context, consistency)
    if level in {"hours", "trend"} and _is_loose(consistency):
        if context.unusual_food_48h is True:
            return (
                "Evita altri extra e mantieni il cibo abituale. Se le prossime "
                "evacuazioni non migliorano o compaiono altri sintomi, senti il veterinario."
            )
        if not _food_known(context):
            return (
                "Per oggi non cambiare quantità o alimento sulla base della sola foto. "
                "Mantieni stabile la routine ed evita nuovi extra."
            )
        return (
            "Per oggi mantieni invariati alimento e quantità. Se le prossime "
            "evacuazioni non migliorano, rivaluta insieme al veterinario."
        )
    if _recent_food_change(context) and _is_loose(consistency):
        return (
            "Il cambiamento coincide con il nuovo alimento: osserva l’andamento "
            "senza attribuirlo al cibo."
        )
    if baseline_code in {"ABOVE_USUAL", "BELOW_USUAL"}:
        return (
            "Controlla la prossima evacuazione: se torna più formata, "
            "il cambiamento può restare un episodio occasionale."
        )
    if baseline_code == "INSUFFICIENT":
        return (
            f"Continua a registrare le prossime osservazioni: ci serve ancora "
            f"storico per capire se questo è abituale per {name}."
        )
    if baseline_code == "NEAR_USUAL":
        return (
            f"Non c’è nulla di urgente: per {name} corrisponde al suo andamento "
            "abituale."
        )
    if level == "once":
        return (
            "Controlla la prossima evacuazione: se torna più formata, "
            "il cambiamento può restare un episodio occasionale."
        )
    return (
        f"Continua a registrare le prossime osservazioni di {name} per confrontarle "
        "con questa."
    )


def _what_to_watch(
    *,
    observation: dict[str, Any],
    context: DigestiveContext,
    consistency: str,
    state: DigestiveState,
) -> list[str]:
    """Return only signs that could materially change today's decision."""
    if state is DigestiveState.ROUTINE:
        return []
    if state is DigestiveState.VET_CONTACT:
        return [
            "peggioramento rapido o forte debolezza",
            "vomito ripetuto o difficoltà a bere",
            "altro sangue o feci molto scure",
        ]

    items: list[str] = []
    if _is_loose(consistency):
        items.extend(
            [
                "vomito o appetito ridotto",
                "nuove evacuazioni liquide ravvicinate",
            ]
        )
    if consistency == "hard" or context.straining_or_urgency is True:
        items.append("sforzo, dolore o difficoltà a evacuare")
    if _visual_safety_action(observation):
        items.append("altro sangue, materiale estraneo o feci molto scure")
    if context.reduced_activity_today is not True:
        items.append("energia molto più bassa del normale")
    return list(dict.fromkeys(items))[:3]


def _evidence_lines(
    *,
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    observation: dict[str, Any],
    observed_summary: str,
) -> list[str]:
    lines: list[str] = []
    texture = _texture_phrase(consistency)
    if baseline_code == "ABOVE_USUAL" and texture or baseline_code == "BELOW_USUAL" and texture:
        lines.append(
            f"{texture.capitalize()} rispetto alle osservazioni utili precedenti"
        )
    elif baseline_code == "NEAR_USUAL":
        lines.append("In linea con le osservazioni utili precedenti")
    level = _repetition_level(context, consistency)
    if level == "hours":
        lines.append("Andamento ripetuto nelle ultime ore")
    elif level == "trend":
        lines.append("Andamento ripetuto nelle osservazioni simili precedenti")
    elif level == "once":
        lines.append("Un precedente cambiamento dello stesso tipo")
    stable = _food_stability_phrase(context)
    if stable:
        lines.append(stable)
    elif _recent_food_change(context):
        span = _food_started_span(context)
        lines.append(f"Alimento iniziato da {span}")
    if context.vomiting_today is False:
        lines.append("Nessun vomito segnalato")
    if context.reduced_activity_today is False:
        lines.append("Nessun calo di attività segnalato")
    mucus = _candidate_level(observation, "mucus_candidate")
    if mucus in {"possible", "clear_candidate"} and not _visual_safety_action(
        observation
    ):
        lines.append(
            "La foto suggerisce un po’ di muco, ma il dettaglio non è abbastanza "
            "chiaro da considerarlo confermato."
        )
    if observed_summary:
        lines.append(observed_summary)
    unique: list[str] = []
    for item in lines:
        if item not in unique:
            unique.append(item)
    return unique[:6]


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


_SHAPE_COPY = {
    "pellets": "a palline",
    "log": "cilindrica",
    "piled": "ammassata",
    "flat": "appiattita",
    "irregular": "irregolare",
}
_MOISTURE_COPY = {
    "low": "bassa",
    "normal": "nella norma visiva",
    "high": "elevata",
}
_VOLUME_COPY = {
    "low": "ridotto",
    "normal": "nella norma visiva",
    "high": "abbondante",
}


def _visible_observation_details(
    consistency: str, observation: dict[str, Any]
) -> str:
    """Describe only owner-useful visible facts; technical scoring stays in audit."""

    details: list[str] = []
    texture = _texture_phrase(consistency)
    if texture:
        details.append(f"consistenza {texture}")
    color = color_family_copy(
        observation.get("color_family") or observation.get("color") or ""
    )
    if color:
        details.append(f"colore {color}")

    if not details:
        return ""
    return "Dalla foto risultano " + " e ".join(details) + "."



def _general_layer_summary(
    *,
    context: DigestiveContext,
    consistency: str,
    observation: dict[str, Any],
) -> str:
    name = context.dog_name
    texture = _texture_phrase(consistency)
    details = _visible_observation_details(consistency, observation)
    if verification_unavailable(observation):
        caution = (
            f"Non riesco a confermare bene questo dettaglio dalla foto di {name}. "
            f"{unavailable_caution_detail(observation)}"
        )
        return f"{details} {caution}".strip()
    visual = _visual_safety_why(observation, name)
    if visual:
        return f"{details} {visual}".strip()
    if consistency == "formed":
        meaning = "Non emergono anomalie visibili."
        return f"{details} {meaning}".strip()
    if texture:
        meaning = f"Questo aspetto merita di essere seguito nelle prossime evacuazioni."
        return f"{details} {meaning}".strip()
    fallback = (
        f"Ho una nuova osservazione digestiva per {name}, descritta con la "
        "scala fecale canina generale."
    )
    return f"{details} {fallback}".strip()


def _profile_layer(
    *,
    context: DigestiveContext,
    consistency: str,
    claim_ids: set[str],
) -> DigestiveInterpretationLayer | None:
    bits: list[str] = []
    factors: list[str] = []
    used_claims: list[str] = []
    if (
        "DIG_AGE_STAGE_CONTEXT_001" in claim_ids
        and _is_puppy_stage(context.age_stage)
        and _is_loose(consistency)
    ):
        bits.append(
            f"Nella fase di crescita di {context.dog_name} i cambiamenti "
            "digestivi meritano un seguito più attento, senza considerarli "
            "automaticamente normali."
        )
        factors.append("age_stage")
        used_claims.append("DIG_AGE_STAGE_CONTEXT_001")
    if (
        "DIG_SIZE_CONTEXT_001" in claim_ids
        and _is_large_size(context.size)
        and _is_loose(consistency)
    ):
        bits.append(
            "Nei cani di taglia grande le feci possono risultare più morbide "
            "più spesso come tendenza di popolazione, non come regola "
            "individuale."
        )
        factors.append("size")
        used_claims.append("DIG_SIZE_CONTEXT_001")
    if (
        "DIG_WEIGHT_CONTEXT_001" in claim_ids
        and context.weight_delta_kg is not None
        and abs(context.weight_delta_kg) >= 1.0
    ):
        direction = "perso" if context.weight_delta_kg < 0 else "preso"
        bits.append(
            f"Nel diario del peso {context.dog_name} ha {direction} circa "
            f"{abs(context.weight_delta_kg):.1f} kg: è un contesto "
            "nutrizionale da seguire, non una causa dimostrata."
        )
        factors.append("weight_delta")
        used_claims.append("DIG_WEIGHT_CONTEXT_001")
    if not bits:
        return None
    return DigestiveInterpretationLayer(
        key="profile",
        title=f"Profilo di {context.dog_name}",
        summary=" ".join(bits[:2]),
        claim_ids=used_claims,
        factors_used=factors,
    )


def _longitudinal_layer(
    *,
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    claim_ids: set[str],
) -> DigestiveInterpretationLayer | None:
    bits: list[str] = []
    factors: list[str] = []
    used_claims: list[str] = []
    level = _repetition_level(context, consistency)
    if baseline_code == "NEAR_USUAL":
        bits.append(
            f"È in linea con le osservazioni recenti di {context.dog_name}."
        )
        factors.append("personal_baseline")
        if "DIG_BASELINE_PERSONAL_001" in claim_ids:
            used_claims.append("DIG_BASELINE_PERSONAL_001")
    elif baseline_code in {"ABOVE_USUAL", "BELOW_USUAL"}:
        direction = (
            "più morbida" if baseline_code == "ABOVE_USUAL" else "più compatta"
        )
        bits.append(
            f"È {direction} rispetto alle osservazioni recenti di "
            f"{context.dog_name}."
        )
        factors.append("personal_baseline")
        if "DIG_BASELINE_PERSONAL_001" in claim_ids:
            used_claims.append("DIG_BASELINE_PERSONAL_001")
    if level in {"hours", "trend"}:
        bits.append(
            "Lo stesso tipo di cambiamento si sta ripetendo nelle "
            "osservazioni simili."
        )
        factors.append("semantic_repetition")
    elif level == "once":
        bits.append("Un cambiamento di questo tipo si è già presentato.")
        factors.append("semantic_repetition")
    if _recent_food_change(context):
        bits.append(_food_started_sentence(context))
        factors.append("recent_food")
        if "DIG_FOOD_CHANGE_001" in claim_ids:
            used_claims.append("DIG_FOOD_CHANGE_001")
    symptom = _owner_symptom_sentence(context)
    if symptom:
        bits.append(symptom)
        factors.append("owner_symptoms")
    if not bits:
        return None
    return DigestiveInterpretationLayer(
        key="longitudinal",
        title="Storico personale",
        summary=" ".join(bits[:2]),
        claim_ids=list(dict.fromkeys(used_claims)),
        factors_used=factors,
    )


def _build_interpretation_layers(
    *,
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    observation: dict[str, Any],
    claim_ids: list[str],
) -> list[DigestiveInterpretationLayer]:
    claims = set(claim_ids)
    general_claims = [
        claim_id
        for claim_id in claim_ids
        if claim_id.startswith("DIG_SCORE_")
        or claim_id
        in {
            "DIG_PHOTO_VALIDATION_001",
            "DIG_MUCUS_001",
            "DIG_FRESH_BLOOD_001",
            "DIG_FRESH_BLOOD_POSSIBLE_001",
            "DIG_BLACK_TARRY_001",
            "DIG_BLACK_TARRY_POSSIBLE_001",
            "DIG_FOREIGN_MATERIAL_001",
            "DIG_FOREIGN_POSSIBLE_001",
            "DIG_COLOR_NONRED_NONBLACK_001",
            "DIG_UNDIGESTED_FOOD_001",
        }
    ][:6]
    layers = [
        DigestiveInterpretationLayer(
            key="general",
            title="Valutazione generale",
            summary=_general_layer_summary(
                context=context,
                consistency=consistency,
                observation=observation,
            ),
            claim_ids=general_claims,
            factors_used=["observation"],
        )
    ]
    profile = _profile_layer(
        context=context, consistency=consistency, claim_ids=claims
    )
    if profile is not None:
        layers.append(profile)
    longitudinal = _longitudinal_layer(
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        claim_ids=claims,
    )
    if longitudinal is not None:
        layers.append(longitudinal)
    return layers



def _synthesize_from_layers(
    *,
    layers: list[DigestiveInterpretationLayer],
    context: DigestiveContext,
    consistency: str,
    baseline_code: str,
    state: DigestiveState,
    safety: DigestiveState,
    observation: dict[str, Any],
    followup_question: str | None,
) -> tuple[str, str, str]:
    """Compose one owner decision from the resolved interpretation layers."""
    by_key = {layer.key: layer for layer in layers}
    general = by_key["general"]

    headline = _consumer_headline(
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        safety=safety,
        observation=observation,
    )

    if safety is DigestiveState.VET_CONTACT or verification_unavailable(observation):
        summary = general.summary
    elif safety is DigestiveState.ATTENTION:
        summary = _useful_info(
            context=context,
            consistency=consistency,
            baseline_code=baseline_code,
            safety=safety,
            observation=observation,
        )
    elif state is DigestiveState.ROUTINE and consistency == "formed":
        headline = f"Tutto regolare per {context.dog_name}"
        summary = (
            "Le feci sono ben formate e non mostrano anomalie visibili. "
            "Da questa foto non emerge alcun motivo per cambiare alimento o quantità."
        )
    elif followup_question:
        repetition = _repetition_level(context, consistency)
        if "mangiato qualcosa di diverso" in followup_question:
            summary = (
                "Non emergono segnali visivi di urgenza. Sapere se ha mangiato "
                "qualcosa di diverso può chiarire quale scelta è più utile oggi."
            )
        elif repetition == "hours":
            summary = (
                "Il cambiamento si è ripetuto nelle ultime ore. "
                "Per capire se basta monitorare, mi serve sapere come sta oggi."
            )
        elif repetition == "once":
            summary = (
                "Un cambiamento simile era già comparso. "
                "Per capire se basta monitorare, mi serve sapere come sta oggi."
            )
        else:
            summary = (
                "Dalla foto non emergono segnali che richiedono urgenza. "
                "Per capire se basta monitorare, mi serve sapere come sta oggi."
            )
    else:
        repetition = _repetition_level(context, consistency)
        factor = _personal_factor(
            context,
            baseline_code=baseline_code,
            consistency=consistency,
        )
        if repetition in {"hours", "trend"} and _is_loose(consistency):
            if context.unusual_food_48h is True:
                summary = (
                    "Non emergono segnali visivi di urgenza. Quello che ha mangiato "
                    "di diverso può coincidere con il cambiamento, senza provarne la causa."
                )
            else:
                summary = (
                    "Non emergono segnali visivi di urgenza, ma la consistenza "
                    "non è ancora tornata stabile. Dai dati disponibili non emerge "
                    "una causa precisa."
                )
        elif repetition == "once":
            summary = (
                "Un cambiamento simile era già comparso. "
                "Controlla il prossimo episodio per vedere se rientra."
            )
        elif factor:
            summary = factor
        elif state is DigestiveState.MONITOR:
            summary = (
                "Dalla foto non emergono segnali che richiedono urgenza. "
                "Controlla il prossimo episodio per vedere se rientra."
            )
        else:
            summary = general.summary

    next_step = _final_advice(
        observation=observation,
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        safety=safety,
        followup_question=followup_question,
    )
    return headline, summary, next_step


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


    relevant_context = _evidence_lines(
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        observation=observation,
        observed_summary=observed_summary,
    )
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
    # Season associations stay off until a registry claim exists.

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
        age_stage_puppy=_is_puppy_stage(context.age_stage),
        size_large=_is_large_size(context.size),
        soft_or_loose=_is_loose(consistency),
        owner_context_used=_owner_context_used(context),
    )
    interpretation_layers = _build_interpretation_layers(
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        observation=observation,
        claim_ids=knowledge.claim_ids,
    )

    headline, summary, next_step = _synthesize_from_layers(
        layers=interpretation_layers,
        context=context,
        consistency=consistency,
        baseline_code=baseline_code,
        state=state,
        safety=safety,
        observation=observation,
        followup_question=followup_question,
    )

    return DigestiveIntelligenceResult(
        overall_state=state,
        consumer_headline=headline,
        consumer_summary=summary,
        baseline_comparison=baseline_code,
        interpretation_layers=interpretation_layers,
        relevant_context=relevant_context,
        possible_associations=associations,
        safety_state=safety,
        recommended_next_step=next_step,
        followup_key=followup_key,
        followup_question=followup_question,
        useful_action=useful_action,
        what_to_watch=_what_to_watch(
            observation=observation,
            context=context,
            consistency=consistency,
            state=state,
        ),
        observation_reliability=reliability,
        knowledge_references=knowledge.references,
        knowledge_claim_ids=knowledge.claim_ids,
        knowledge_registry_version=knowledge.registry_version,
        knowledge_registry_checksum=knowledge.checksum,
    )
