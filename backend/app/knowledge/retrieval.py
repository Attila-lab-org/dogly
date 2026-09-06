"""Bounded deterministic retrieval over the validated scientific registry."""

from __future__ import annotations

from app.contracts.observation import ObservationContract, TriState
from app.contracts.taxonomy import ContextBucket
from app.knowledge.models import (
    DogContextSnapshot,
    KnowledgeContext,
    ScientificEvidenceSummary,
)
from app.knowledge.registry import get_registry


def _candidate_ids(
    observation: ObservationContract,
    context_bucket: ContextBucket,
    dog_context: DogContextSnapshot,
) -> list[str]:
    ids: list[str] = []
    body = observation.body
    if body.body_height == "lowered" or body.posture in {"crouch", "lowered"}:
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
    if "play_bow" in body.posture:
        ids.append("OBS_BODY_004")

    tail = observation.tail
    if tail.neutral_relative_height in {"below", "tucked"}:
        ids.append("OBS_TAIL_001")
    elif tail.neutral_relative_height == "above":
        ids.append("OBS_TAIL_002")
    if tail.movement in {"wagging", "stiff_sweep"}:
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
    distress_signals = sum(
        (
            body.body_height == "lowered",
            body.approach_withdrawal_freeze in {"freeze", "withdrawal"},
            tail.neutral_relative_height == "tucked",
            observation.head_face.lip_lick_candidate == TriState.YES,
        )
    )
    if distress_signals >= 2:
        ids.insert(0, "SAFE_DISTRESS_001")
    if body.rigidity_candidate == TriState.YES and "growl" in vocalizations:
        ids.insert(0, "SAFE_ESCALATION_001")
    if any("pain" in fact.key.lower() for fact in dog_context.health_context):
        ids.insert(0, "SAFE_PAIN_001")
    return list(dict.fromkeys(ids))


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
    coverage = "LOW" if not cards else "HIGH" if len(cards) >= 3 else "MEDIUM"
    return KnowledgeContext(
        registry_version=str(registry.metadata["version"]),
        coverage=coverage,
        cards=cards,
    )
