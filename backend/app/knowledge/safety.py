"""Regole deterministiche di sicurezza comportamentale — fonte unica di verità.

Le stesse regole alimentano due consumatori:
- `fired_safety_ids`: retrieval inserisce le card SAFE_*_001 come evidenza;
- `deterministic_safety_flags`: il worker converte gli id in SafetyFlag PRIMA
  del reasoner, così il gate urgente dell'Advice Engine funziona anche se l'LLM
  rimane silenzioso (sez. 16.3 / 19.3: testo generato non può degradare un
  flag di sicurezza).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.contracts.interpretation import SafetyFlag
from app.contracts.observation import ObservationContract, Posture, TriState
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


def _fact_is_current(fact: object) -> bool:
    """Old medical history is context, not a permanent current-pain alarm."""
    confirmed = getattr(fact, "last_confirmed_at", None)
    if not isinstance(confirmed, datetime):
        return False
    if confirmed.tzinfo is None:
        confirmed = confirmed.replace(tzinfo=UTC)
    return confirmed >= datetime.now(UTC) - timedelta(days=7)


def _play_context(observation: ObservationContract) -> bool:
    text = " ".join(
        [
            observation.scene.environment_class,
            *observation.scene.visible_objects,
            *observation.scene.spatial_relations,
            *[
                change
                for segment in observation.timeline
                for change in segment.observed_changes
            ],
        ]
    ).casefold()
    return (
        observation.body.posture is Posture.PLAY_BOW
        or (
            observation.body.posture is Posture.LOOSE
            and any(token in text for token in ("play", "gioco", "tug", "tirare"))
        )
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
    distance_signal = body.approach_withdrawal_freeze in {"freeze", "withdrawal"}
    supporting_distress = sum(
        (
            observation.tail.neutral_relative_height == "tucked",
            observation.head_face.lip_lick_candidate == TriState.YES,
            observation.ears.position in {"back", "flat_back"},
        )
    )
    # Lowered morphology or one displacement signal is never an emergency.
    if distance_signal and supporting_distress >= 2 and not _play_context(observation):
        ids.append(SAFE_DISTRESS_001)
    escalation_target = " ".join(
        [
            body.orientation_target,
            observation.head_face.gaze_target,
            *observation.scene.spatial_relations,
        ]
    ).casefold()
    if (
        body.rigidity_candidate == TriState.YES
        and "growl" in vocalizations
        and not _play_context(observation)
        and any(
            marker in escalation_target
            for marker in ("person", "persona", "owner", "propriet", "dog", "cane", "resource", "risorsa")
        )
    ):
        ids.append(SAFE_ESCALATION_001)
    current_health = [
        *dog_context.today_vs_usual,
        *dog_context.recent_changes,
        *dog_context.health_context,
    ]
    if any(
        _fact_reports_pain(fact) and _fact_is_current(fact)
        for fact in current_health
    ):
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
