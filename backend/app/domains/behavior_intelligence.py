"""Deterministic Behavior Intelligence V2 consumer composer.

The reasoner produces an InterpretationContract. This layer turns that
internal result into the owner-facing blocks: headline, "Per {name}",
safety actions, and what to watch. Generated text may never replace or
downgrade a deterministic safety flag (sez. 16.3 / 19.3).
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.interpretation import (
    InterpretationContract,
    PersonalMemoryUsed,
    SafetyFlag,
)
from app.contracts.taxonomy import IntentCode
from app.knowledge.models import AdviceItem, DogContextSnapshot
from app.knowledge.safety import (
    SAFE_DISTRESS_001,
    SAFE_ESCALATION_001,
    SAFE_PAIN_001,
)

BEHAVIOR_CONSUMER_VERSION = "behavior-consumer/v1"

_SEVERITY_RANK = {
    "info": 0,
    "low": 0,
    "medium": 1,
    "high": 2,
    "urgent": 3,
    "critical": 4,
}


class BaselineComparison(StrEnum):
    RECOGNIZED = "RECOGNIZED"
    VARIATION = "VARIATION"
    LEARNING = "LEARNING"
    CONTESTED = "CONTESTED"


class BehaviorSafetyCopy(BaseModel):
    """Owner action for a fired safety flag — never a technical code."""

    model_config = ConfigDict(extra="forbid")

    code: str
    severity: str
    title: str
    message: str
    action: str


class BehaviorConsumerResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = "behavior_consumer.v1"
    consumer_headline: str
    consumer_summary: str
    baseline_comparison: BaselineComparison
    baseline_note: str | None = None
    recommended_next_step: str | None = None
    what_to_watch: str | None = None
    safety: BehaviorSafetyCopy | None = None
    personal_memory_used: list[PersonalMemoryUsed] = Field(default_factory=list)
    composer_version: str = BEHAVIOR_CONSUMER_VERSION


# Deterministic safety copy. Do not replace with model output.
SAFETY_COPY: dict[str, tuple[str, str, str]] = {
    SAFE_ESCALATION_001: (
        "Chiede più spazio",
        (
            "Il corpo appare teso e c’è un segnale di avvertimento. "
            "Non è una previsione di morso: è un momento in cui forzare il contatto aumenta il rischio."
        ),
        "Aumenta la distanza e non forzare il contatto.",
    ),
    SAFE_DISTRESS_001: (
        "Sembra in difficoltà",
        (
            "Ci sono più segnali compatibili con disagio. Non è una diagnosi: "
            "in questo momento serve spazio, non pressione."
        ),
        "Fai un passo indietro e lascialo allontanarsi se vuole.",
    ),
    SAFE_PAIN_001: (
        "Possibile disagio fisico",
        (
            "Il contesto che hai condiviso include un possibile disagio. "
            "Dogly non diagnostica dolore: se è nuovo, intenso o persistente, parlane col veterinario."
        ),
        "Non forzare movimento o contatto; se persiste, senti il veterinario.",
    ),
}

_HEADLINES: dict[IntentCode, str] = {
    IntentCode.PLAY_INTERACTION: "{name} sembra voler giocare con te",
    IntentCode.ATTENTION_REQUEST: "{name} sembra voler attirare la tua attenzione",
    IntentCode.OUTSIDE_REQUEST: "Potrebbe voler uscire",
    IntentCode.ALERT_VIGILANCE: "{name} è molto attento a qualcosa",
    IntentCode.DISCOMFORT_AVOIDANCE: "{name} sembra poco a suo agio",
    IntentCode.FEAR_INSECURITY: "{name} sembra poco a suo agio",
    IntentCode.HIGH_AROUSAL: "{name} è molto attivato in questo momento",
    IntentCode.FRUSTRATION: "Potrebbe essere frustrato",
    IntentCode.RELAX_REST: "{name} sembra tranquillo e rilassato",
    IntentCode.RESOURCE_TENSION: "{name} sembra chiedere più spazio intorno a questa risorsa",
    IntentCode.AMBIGUOUS: "Ci sono due spiegazioni possibili",
    IntentCode.INSUFFICIENT: "Non ho abbastanza elementi per capirlo bene",
}


def _pick_safety(flags: list[SafetyFlag]) -> BehaviorSafetyCopy | None:
    ranked: list[tuple[int, SafetyFlag, tuple[str, str, str]]] = []
    for flag in flags:
        copy = SAFETY_COPY.get(flag.code)
        if copy is None:
            continue
        ranked.append((_SEVERITY_RANK.get(flag.severity.lower(), 0), flag, copy))
    if not ranked:
        # Unknown codes still must not leak to the owner as SAFE_* identifiers.
        urgent = [
            flag
            for flag in flags
            if flag.severity.lower() in {"urgent", "critical", "high"}
        ]
        if not urgent:
            return None
        flag = urgent[0]
        return BehaviorSafetyCopy(
            code=flag.code,
            severity=flag.severity,
            title="Serve più distanza",
            message="Ci sono segnali di tensione. Meglio non forzare il contatto.",
            action="Aumenta la distanza e osserva da un punto più tranquillo.",
        )
    _rank, flag, (title, message, action) = max(ranked, key=lambda item: item[0])
    return BehaviorSafetyCopy(
        code=flag.code,
        severity=flag.severity,
        title=title,
        message=message,
        action=action,
    )


def _headline(dog_name: str, intent: IntentCode | None, safety: BehaviorSafetyCopy | None) -> str:
    if safety is not None and safety.code == SAFE_ESCALATION_001:
        return f"{dog_name} sembra chiedere più spazio"
    if intent is None or intent is IntentCode.INSUFFICIENT:
        return _HEADLINES[IntentCode.INSUFFICIENT]
    template = _HEADLINES.get(intent, "{name} — sto ancora leggendo i segnali")
    return template.format(name=dog_name)


def _owner_reported_off(dog_context: DogContextSnapshot) -> bool:
    for fact in dog_context.today_vs_usual:
        if str(fact.key).lower() == "concern" and str(fact.value).lower() == "off":
            return True
        if str(fact.value).lower() in {"off", "unusual", "not_usual"}:
            return True
    return False


def _baseline(
    dog_name: str,
    interpretation: InterpretationContract,
    dog_context: DogContextSnapshot,
) -> tuple[BaselineComparison, str]:
    memory = interpretation.personal_memory_used
    contested = any(item.state.upper() == "CONTESTED" for item in memory)
    established = [
        item
        for item in memory
        if item.state.upper() in {"ESTABLISHED", "STRONG"}
    ]
    if contested:
        return (
            BaselineComparison.CONTESTED,
            (
                "In situazioni simili le tue risposte sono state diverse: "
                "questa volta evito una conclusione forte."
            ),
        )
    if _owner_reported_off(dog_context):
        return (
            BaselineComparison.VARIATION,
            f"Questa volta il comportamento è diverso dal solito di {dog_name}.",
        )
    if established:
        return (
            BaselineComparison.RECOGNIZED,
            f"È simile ad altri episodi che hai già confermato per {dog_name}.",
        )
    if any(item.state.upper() == "PRELIMINARY" for item in memory):
        return (
            BaselineComparison.LEARNING,
            (
                f"Vedo alcune somiglianze con episodi recenti di {dog_name}, "
                "ma servono ancora le tue conferme."
            ),
        )
    return (
        BaselineComparison.LEARNING,
        (
            f"Sto ancora imparando il modo di comunicare di {dog_name}: "
            "questa lettura si basa soprattutto su ciò che vedo ora."
        ),
    )


def build_behavior_consumer(
    interpretation: InterpretationContract,
    *,
    dog_name: str,
    dog_context: DogContextSnapshot,
    advice: AdviceItem | None = None,
) -> BehaviorConsumerResult:
    safety = _pick_safety(interpretation.safety_flags)
    headline = _headline(dog_name, interpretation.primary_intent, safety)
    comparison, baseline_note = _baseline(dog_name, interpretation, dog_context)
    insufficient = interpretation.primary_intent in {
        None,
        IntentCode.INSUFFICIENT,
    }
    next_step = safety.action if safety is not None else (advice.action if advice else None)
    if insufficient and next_step is None:
        next_step = (
            "Prova un altro breve video, con il corpo intero visibile e un po’ più di contesto."
        )
    what_to_watch = advice.follow_up if advice is not None else None
    if safety is not None and not what_to_watch:
        what_to_watch = "Se la tensione resta o aumenta, interrompi e dai spazio."
    return BehaviorConsumerResult(
        consumer_headline=headline,
        consumer_summary=interpretation.consumer_summary,
        baseline_comparison=comparison,
        baseline_note=baseline_note,
        recommended_next_step=next_step,
        what_to_watch=what_to_watch,
        safety=safety,
        personal_memory_used=list(interpretation.personal_memory_used),
    )
