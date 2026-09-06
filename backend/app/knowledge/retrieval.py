"""Bounded deterministic retrieval over the validated scientific registry."""

from __future__ import annotations

from app.contracts.observation import (
    BodyHeight,
    ObservationContract,
    Posture,
    TailHeight,
    TailMovement,
    TriState,
)
from app.contracts.taxonomy import ContextBucket
from app.knowledge.models import (
    DogContextSnapshot,
    KnowledgeContext,
    ScientificEvidenceSummary,
)
from app.knowledge.registry import get_registry
from app.knowledge.safety import fired_safety_ids


def _candidate_ids(
    observation: ObservationContract,
    context_bucket: ContextBucket,
    dog_context: DogContextSnapshot,
) -> list[str]:
    ids: list[str] = []
    body = observation.body
    if body.body_height == BodyHeight.LOWERED or body.posture in {
        Posture.CROUCH,
        Posture.LOWERED,
    }:
        ids.append("OBS_BODY_001")
    if body.rigidity_candidate == TriState.YES:
        ids.append("OBS_BODY_002")
    movement = body.approach_withdrawal_freeze
    ids.extend(
        {
            "freeze": ["OBS_BODY_003"],
            "approach": ["OBS_BODY_005"],
            "withdrawal": ["OBS_BODY_006"],
        }.get(movement, [])
    )
    if body.posture == Posture.PLAY_BOW:
        ids.append("OBS_BODY_004")

    tail = observation.tail
    if tail.neutral_relative_height in {TailHeight.BELOW, TailHeight.TUCKED}:
        ids.append("OBS_TAIL_001")
    elif tail.neutral_relative_height == TailHeight.ABOVE:
        ids.append("OBS_TAIL_002")
    if tail.movement in {TailMovement.WAGGING, TailMovement.STIFF_SWEEP}:
        ids.append("OBS_TAIL_003")

    ears = observation.ears.position.lower()
    if "back" in ears or "flat" in ears:
        ids.append("OBS_EAR_001")
    elif "forward" in ears:
        ids.append("OBS_EAR_002")
    if observation.head_face.lip_lick_candidate == TriState.YES:
        ids.append("OBS_FACE_003")
    if observation.head_face.yawn_candidate == TriState.YES:
        ids.append("OBS_FACE_005")

    vocalizations = {item.lower() for item in observation.vocalization.type_candidates}
    for name, card_id in {
        "bark": "AUD_BARK_001",
        "growl": "AUD_GROWL_001",
        "whine": "AUD_WHINE_001",
        "whimper": "AUD_WHINE_001",
        "howl": "AUD_HOWL_001",
    }.items():
        if name in vocalizations:
            ids.append(card_id)

    visible_objects = {item.lower() for item in observation.scene.visible_objects}
    if observation.scene.human_count:
        ids.append("CTX_HUMAN_001")
    if (observation.scene.dog_count or 0) > 1:
        ids.append("CTX_DOG_001")
    if visible_objects & {"food", "bowl", "toy", "bone"}:
        ids.append("CTX_RESOURCE_001")
    if context_bucket == ContextBucket.DOOR_EXIT:
        ids.append("CTX_SEP_001")
    if dog_context.breed_label:
        ids.append("PRIOR_BREED_001")
    if observation.capture_quality.overall_quality != "good":
        ids.append("ABSTAIN_001")
    # Le regole SAFE_*_001 vivono in knowledge.safety (fonte unica di verità):
    # qui diventano solo card di evidenza, in testa alla lista.
    return list(dict.fromkeys([*fired_safety_ids(observation, dog_context), *ids]))


# Famiglia di segnali per card id: la copertura conta famiglie indipendenti,
# non numero di card (3 card sulla sola famiglia "body" restano poca evidenza).
_CARD_FAMILY: dict[str, str] = {
    "OBS_BODY_001": "body",
    "OBS_BODY_002": "body",
    "OBS_BODY_004": "body",
    "OBS_BODY_003": "locomotion",
    "OBS_BODY_005": "locomotion",
    "OBS_BODY_006": "locomotion",
    "OBS_TAIL_001": "tail",
    "OBS_TAIL_002": "tail",
    "OBS_TAIL_003": "tail",
    "OBS_EAR_001": "ears",
    "OBS_EAR_002": "ears",
    "OBS_FACE_003": "face",
    "OBS_FACE_005": "face",
    "AUD_BARK_001": "vocalization",
    "AUD_GROWL_001": "vocalization",
    "AUD_WHINE_001": "vocalization",
    "AUD_HOWL_001": "vocalization",
    "CTX_HUMAN_001": "context",
    "CTX_DOG_001": "context",
    "CTX_RESOURCE_001": "context",
    "CTX_SEP_001": "context",
    "PRIOR_BREED_001": "context",
}

# Coppie di evidenze mutuamente incompatibili rilevate sull'osservazione
# (ciascuna coppia presente = 1 contraddizione).
_CONTRADICTION_PAIRS = (
    (frozenset({"OBS_TAIL_003"}), frozenset({"OBS_TAIL_001"})),
    (frozenset({"OBS_BODY_005"}), frozenset({"OBS_BODY_006", "OBS_BODY_003"})),
    (frozenset({"OBS_EAR_002"}), frozenset({"OBS_EAR_001"})),
)


def _compute_coverage(
    cards: list[ScientificEvidenceSummary],
    observation: ObservationContract,
) -> str:
    """Copertura a punteggio su famiglie di segnali indipendenti.

    Formula (banda LOW/MEDIUM/HIGH invariata nel contratto):
        famiglie = #{famiglie distinte con almeno 1 card di evidenza}
                 (body, locomotion, tail, ears, vocalization, context, face)
        score  = 2 * famiglie                                  (max 14)
               + min(3, #card con evidence_grade "A")          (bonus qualità)
               - 2 * contraddizioni rilevate                   (min 0)
        banda  = HIGH se score >= 8, MEDIUM se score >= 4, altrimenti LOW.

    Vincoli:
    - ABSTAIN_001 e le card SAFE_*_001 NON danno punteggio: giustificano solo
      astensione/sicurezza, non alzano MAI la copertura;
    - capture_quality "degraded" tappa la banda a MEDIUM (il caso
      "insufficient" è già respinto upstream dal quality gate sez. 13);
    - una contraddizione tra segnali (es. coda che scodinzola + coda tucked)
      abbassa la confidenza di banda.
    """
    scored = [card for card in cards if card.card_id in _CARD_FAMILY]
    families = {_CARD_FAMILY[card.card_id] for card in scored}
    grade_bonus = min(3, sum(1 for card in scored if card.evidence_grade == "A"))
    card_ids = {card.card_id for card in scored}
    contradictions = sum(
        1 for positive, negative in _CONTRADICTION_PAIRS if card_ids & positive and card_ids & negative
    )
    score = max(0, 2 * len(families) + grade_bonus - 2 * contradictions)
    if score >= 8:
        coverage = "HIGH"
    elif score >= 4:
        coverage = "MEDIUM"
    else:
        coverage = "LOW"
    if (
        coverage == "HIGH"
        and observation.capture_quality.overall_quality != "good"
    ):
        # Qualità degradata: tappo prudenziale a MEDIUM.
        coverage = "MEDIUM"
    return coverage


def retrieve_evidence(
    observation: ObservationContract,
    context_bucket: ContextBucket,
    dog_context: DogContextSnapshot,
) -> KnowledgeContext:
    registry = get_registry()
    by_id = {card.id: card for card in registry.base_knowledge_cards}
    cards = [
        ScientificEvidenceSummary(
            card_id=card.id,
            evidence_grade=card.evidence,
            label=card.label,
            compatible_interpretations=card.compatible,
            modifiers=card.modifiers,
            forbidden_conclusion=card.not_conclude,
            source_ids=card.sources,
        )
        for card_id in _candidate_ids(observation, context_bucket, dog_context)[:6]
        if (card := by_id.get(card_id)) is not None
    ]
    return KnowledgeContext(
        registry_version=str(registry.metadata["version"]),
        coverage=_compute_coverage(cards, observation),
        cards=cards,
    )
