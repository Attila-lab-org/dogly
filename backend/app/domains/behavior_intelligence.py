"""Governed Behavior Intelligence V3 consumer composer.

The decision policy has already validated the reasoner's clip-specific
interpretation. This layer orchestrates that grounded copy, personal context,
safety actions and what to watch. It does not replace a specific reading with
generic prose for the selected intent.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.interpretation import (
    AlternativeIntent,
    EvidenceItem,
    EvidenceSource,
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

BEHAVIOR_CONSUMER_VERSION = "behavior-consumer/v3"

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

    schema_version: str = "behavior_consumer.v2"
    consumer_headline: str
    dog_voice: str
    consumer_summary: str
    baseline_comparison: BaselineComparison
    baseline_note: str | None = None
    recommended_next_step: str | None = None
    what_to_watch: str | None = None
    safety: BehaviorSafetyCopy | None = None
    personal_memory_used: list[PersonalMemoryUsed] = Field(default_factory=list)
    consumer_evidence: list[EvidenceItem] = Field(default_factory=list)
    consumer_alternatives: list[AlternativeIntent] = Field(default_factory=list)
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
    IntentCode.PLAY_INTERACTION: "{name} ti sta probabilmente invitando a giocare",
    IntentCode.ATTENTION_REQUEST: "{name} sta cercando la tua attenzione",
    IntentCode.OUTSIDE_REQUEST: "{name} probabilmente ti sta chiedendo di uscire",
    IntentCode.ALERT_VIGILANCE: "{name} è in allerta e sta segnalando qualcosa",
    IntentCode.DISCOMFORT_AVOIDANCE: "{name} non è a suo agio e preferisce più spazio",
    IntentCode.FEAR_INSECURITY: "{name} si sente insicuro e cerca protezione",
    IntentCode.HIGH_AROUSAL: "{name} è molto agitato e ha bisogno di rallentare",
    IntentCode.FRUSTRATION: "{name} sembra frustrato e fatica a calmarsi",
    IntentCode.RELAX_REST: "{name} sembra tranquillo e rilassato",
    IntentCode.RESOURCE_TENSION: "{name} sembra chiedere più spazio intorno a questa risorsa",
    IntentCode.AMBIGUOUS: "Ci sono due spiegazioni possibili",
    IntentCode.INSUFFICIENT: "Non ho abbastanza elementi per capirlo bene",
}

_SUMMARIES: dict[IntentCode, str] = {
    IntentCode.PLAY_INTERACTION: (
        "{name} sta probabilmente cercando uno scambio piacevole con te. "
        "È un invito all’interazione, non soltanto movimento o eccitazione."
    ),
    IntentCode.ATTENTION_REQUEST: (
        "{name} sta probabilmente cercando di coinvolgerti o di farti notare "
        "qualcosa. La sua attenzione è rivolta a ottenere una risposta da te."
    ),
    IntentCode.OUTSIDE_REQUEST: (
        "{name} sta probabilmente collegando questo momento all’uscita. "
        "La lettura più plausibile è una richiesta concreta, non semplice agitazione."
    ),
    IntentCode.ALERT_VIGILANCE: (
        "{name} ha probabilmente percepito qualcosa che considera importante e "
        "ti sta avvisando. È concentrato e teso: questa lettura è più compatibile "
        "con allerta e controllo dello stimolo che con un abbaio casuale."
    ),
    IntentCode.DISCOMFORT_AVOIDANCE: (
        "{name} sta comunicando che questa situazione non gli piace e preferirebbe "
        "allontanarsi. Rispettare questa richiesta evita di aumentare la pressione."
    ),
    IntentCode.FEAR_INSECURITY: (
        "{name} sembra sentirsi insicuro in questa situazione. In questo momento "
        "ha bisogno di poter prendere distanza e ritrovare calma."
    ),
    IntentCode.HIGH_AROUSAL: (
        "{name} è molto coinvolto e fa fatica a regolare l’intensità del momento. "
        "Prima di chiedergli altro, è utile aiutarlo a rallentare."
    ),
    IntentCode.FRUSTRATION: (
        "{name} sembra sapere cosa vorrebbe ottenere, ma non riesce a raggiungerlo. "
        "La tensione può quindi crescere se il momento continua nello stesso modo."
    ),
    IntentCode.RELAX_REST: (
        "{name} appare a suo agio e non sta chiedendo un cambiamento. "
        "Puoi lasciargli continuare questo momento tranquillo."
    ),
    IntentCode.RESOURCE_TENSION: (
        "{name} sta probabilmente chiedendo che nessuno si avvicini a ciò che "
        "considera importante. È una richiesta di distanza da rispettare."
    ),
    IntentCode.AMBIGUOUS: (
        "I segnali sostengono due letture diverse che porterebbero a risposte "
        "differenti. Una sola informazione sul contesto può chiarire quale è più probabile."
    ),
    IntentCode.INSUFFICIENT: (
        "Il video non contiene abbastanza segnali coerenti per scegliere una lettura "
        "utile senza inventare."
    ),
}

_DOG_VOICES: dict[IntentCode, str] = {
    IntentCode.PLAY_INTERACTION: "«Ti va di fare qualcosa insieme?»",
    IntentCode.ATTENTION_REQUEST: "«Guardami un momento: ho bisogno di una tua risposta.»",
    IntentCode.OUTSIDE_REQUEST: "«Vorrei uscire: mi accompagni?»",
    IntentCode.ALERT_VIGILANCE: "«C’è qualcosa qui: voglio che tu lo sappia.»",
    IntentCode.DISCOMFORT_AVOIDANCE: "«Questa situazione non mi piace: lasciami spazio.»",
    IntentCode.FEAR_INSECURITY: "«Non mi sento sicuro: aiutami a prendere distanza.»",
    IntentCode.HIGH_AROUSAL: "«È tutto molto intenso: aiutami a rallentare.»",
    IntentCode.FRUSTRATION: "«Non riesco a ottenere ciò che cerco e mi sto innervosendo.»",
    IntentCode.RELAX_REST: "«Sto bene così: lasciami godere questo momento.»",
    IntentCode.RESOURCE_TENSION: "«Non avvicinarti a questa cosa: ho bisogno di spazio.»",
    IntentCode.AMBIGUOUS: "«Potrei volere due cose diverse: guarda cosa succede intorno a me.»",
    IntentCode.INSUFFICIENT: "«Non si vede abbastanza per parlare al posto mio.»",
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


def _meaning_summary(dog_name: str, intent: IntentCode | None) -> str:
    resolved = intent or IntentCode.INSUFFICIENT
    return _SUMMARIES.get(resolved, _SUMMARIES[IntentCode.INSUFFICIENT]).format(
        name=dog_name
    )


def _meaning_voice(dog_name: str, intent: IntentCode | None) -> str:
    del dog_name
    resolved = intent or IntentCode.INSUFFICIENT
    return _DOG_VOICES.get(resolved, _DOG_VOICES[IntentCode.INSUFFICIENT])


def behavior_meaning_copy(
    dog_name: str,
    intent: IntentCode | None,
) -> tuple[str, str, str]:
    """Stable consumer result: meaning first, model observations stay in details."""
    return (
        _headline(dog_name, intent, None),
        _meaning_summary(dog_name, intent),
        _meaning_voice(dog_name, intent),
    )


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



def _select_consumer_evidence(
    interpretation: InterpretationContract,
) -> list[EvidenceItem]:
    """Owner-facing evidence that supported the reading."""
    observed = [
        item
        for item in interpretation.evidence
        if item.source is EvidenceSource.OBSERVATION
    ]
    chosen = observed or list(interpretation.evidence)
    return chosen[:5]


def _select_consumer_alternatives(
    interpretation: InterpretationContract,
    *,
    safety: BehaviorSafetyCopy | None,
) -> list[AlternativeIntent]:
    """Keep bounded alternatives available for owner correction and audit."""
    if safety is not None:
        return []
    alternatives = list(interpretation.alternatives)
    if not alternatives:
        return []
    return alternatives[:2]


def build_behavior_consumer(
    interpretation: InterpretationContract,
    *,
    dog_name: str,
    dog_context: DogContextSnapshot,
    advice: AdviceItem | None = None,
) -> BehaviorConsumerResult:
    safety = _pick_safety(interpretation.safety_flags)
    insufficient = interpretation.primary_intent in {
        None,
        IntentCode.INSUFFICIENT,
    }
    effective_intent = interpretation.primary_intent
    headline = (
        _headline(dog_name, effective_intent, safety)
        if safety is not None or insufficient
        else interpretation.consumer_headline
    )
    if safety is not None:
        dog_voice = {
            SAFE_ESCALATION_001: "«Ho bisogno di più spazio, senza essere forzato.»",
            SAFE_DISTRESS_001: "«Qualcosa mi mette in difficoltà: aiutami a fare una pausa.»",
            SAFE_PAIN_001: "«Potrei non stare bene: osservami con attenzione.»",
        }.get(safety.code, "«Dammi spazio e osserva come sto.»")
    else:
        dog_voice = interpretation.dog_voice
    comparison, baseline_note = _baseline(dog_name, interpretation, dog_context)
    next_step = safety.action if safety is not None else (advice.action if advice else None)
    if insufficient and next_step is None:
        next_step = (
            "Prova un altro breve video, con il corpo intero visibile e un po’ più di contesto."
        )
    what_to_watch = advice.follow_up if advice is not None else None
    if safety is not None and not what_to_watch:
        what_to_watch = "Se la tensione resta o aumenta, interrompi e dai spazio."
    consumer_evidence = _select_consumer_evidence(interpretation)
    consumer_alternatives = _select_consumer_alternatives(
        interpretation, safety=safety
    )
    return BehaviorConsumerResult(
        consumer_headline=headline,
        dog_voice=dog_voice,
        consumer_summary=(
            safety.message if safety is not None else interpretation.consumer_summary
        ),
        baseline_comparison=comparison,
        baseline_note=baseline_note,
        recommended_next_step=next_step,
        what_to_watch=what_to_watch,
        safety=safety,
        personal_memory_used=list(interpretation.personal_memory_used),
        consumer_evidence=consumer_evidence,
        consumer_alternatives=consumer_alternatives,
    )
