"""Regole deterministiche di sicurezza comportamentale — fonte unica di verità.

Le stesse regole alimentano due consumatori:
- `fired_safety_ids`: retrieval inserisce le card SAFE_*_001 come evidenza;
- `deterministic_safety_flags`: il worker converte gli id in SafetyFlag PRIMA
  del reasoner, così il gate urgente dell'Advice Engine funziona anche se l'LLM
  rimane silenzioso (sez. 16.3 / 19.3: testo generato non può degradare un
  flag di sicurezza).
"""

from __future__ import annotations

from app.contracts.interpretation import SafetyFlag
from app.contracts.observation import ObservationContract, TriState
from app.knowledge.models import DogContextSnapshot

SAFE_DISTRESS_001 = "SAFE_DISTRESS_001"
SAFE_ESCALATION_001 = "SAFE_ESCALATION_001"
SAFE_PAIN_001 = "SAFE_PAIN_001"

# Severity deterministica: il gate urgente dell'Advice Engine legge
# {"urgent", "critical"}; mai sotto "high" per un flag SAFE_*.
_SEVERITY_BY_ID = {
    SAFE_DISTRESS_001: "high",
    SAFE_ESCALATION_001: "urgent",
    SAFE_PAIN_001: "high",
}

_SEVERITY_RANK = {"info": 0, "low": 0, "medium": 1, "high": 2, "urgent": 3, "critical": 4}


def _fact_reports_pain(fact: object) -> bool:
    key = str(getattr(fact, "key", "")).lower()
    value = getattr(fact, "value", None)
    if value is None or value is False:
        return False
    text = f"{key} {value}".lower()
    if any(
        phrase in text
        for phrase in ("no pain", "without pain", "nessun dolore", "senza dolore")
    ):
        return False
    return any(
        term in text
        for term in ("pain", "dolor", "zopp", "lameness", "claudic")
    )


def fired_safety_ids(
    observation: ObservationContract,
    dog_context: DogContextSnapshot,
) -> list[str]:
    """Valuta le regole deterministiche e restituisce gli id SAFE_*_001 scattati.

    Unica implementazione delle regole: retrieval e flag-builder la condividono.
    """
    body = observation.body
    vocalizations = {item.lower() for item in observation.vocalization.type_candidates}
    ids: list[str] = []
    distress_signals = sum(
        (
            body.body_height == "lowered",
            body.approach_withdrawal_freeze in {"freeze", "withdrawal"},
            observation.tail.neutral_relative_height == "tucked",
            observation.head_face.lip_lick_candidate == TriState.YES,
        )
    )
    if distress_signals >= 2:
        ids.append(SAFE_DISTRESS_001)
    if body.rigidity_candidate == TriState.YES and "growl" in vocalizations:
        ids.append(SAFE_ESCALATION_001)
    if any(_fact_reports_pain(fact) for fact in dog_context.health_context):
        ids.append(SAFE_PAIN_001)
    return ids


def deterministic_safety_flags(
    observation: ObservationContract,
    dog_context: DogContextSnapshot,
) -> list[SafetyFlag]:
    """Converte le regole scattate in SafetyFlag strutturate (prima dell'LLM)."""
    return [
        SafetyFlag(code=card_id, severity=_SEVERITY_BY_ID[card_id])
        for card_id in fired_safety_ids(observation, dog_context)
    ]


def merge_safety_flags(
    llm_flags: list[SafetyFlag],
    deterministic_flags: list[SafetyFlag],
) -> list[SafetyFlag]:
    """Allow only safety codes independently fired by deterministic rules.

    The model may repeat or raise a known fired flag, but it cannot create a
    new warning without an observable/server-side predicate.
    """
    claimed = {flag.code: flag for flag in llm_flags}
    merged: dict[str, SafetyFlag] = {}
    for flag in deterministic_flags:
        existing = claimed.get(flag.code)
        if existing is None:
            merged[flag.code] = flag
            continue
        det_rank = _SEVERITY_RANK.get(flag.severity.lower(), 0)
        llm_rank = _SEVERITY_RANK.get(existing.severity.lower(), 0)
        merged[flag.code] = flag if det_rank >= llm_rank else existing
    return list(merged.values())
