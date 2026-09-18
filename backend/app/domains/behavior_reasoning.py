"""Deterministic minimum readings for coherent multimodal behavior signals."""

from __future__ import annotations

from app.contracts.interpretation import EvidenceItem, InterpretationContract
from app.contracts.observation import (
    ApproachWithdrawalFreeze,
    BodyHeight,
    EarPosition,
    ObservationContract,
    Posture,
    TailHeight,
    TriState,
    VocalizationType,
)
from app.contracts.taxonomy import ConfidenceBand, IntentCode

_DIRECTION_MARKERS = (
    "off-screen",
    "off_screen",
    "off camera",
    "off-camera",
    "fuori campo",
    "left",
    "right",
    "sinistra",
    "destra",
    "door",
    "window",
    "porta",
    "finestra",
    "outside",
    "esterno",
)


def _directed_off_frame(observation: ObservationContract) -> bool:
    targets = (
        observation.body.orientation_target,
        observation.head_face.head_orientation,
        observation.head_face.gaze_target,
    )
    joined = " ".join(str(item).casefold() for item in targets)
    return any(marker in joined for marker in _DIRECTION_MARKERS)


def _fear_or_avoidance_signal(observation: ObservationContract) -> bool:
    return (
        observation.body.body_height is BodyHeight.LOWERED
        or observation.body.posture in {Posture.CROUCH, Posture.LOWERED}
        or observation.body.approach_withdrawal_freeze
        is ApproachWithdrawalFreeze.WITHDRAWAL
        or observation.tail.neutral_relative_height is TailHeight.TUCKED
        or observation.ears.position is EarPosition.FLAT_BACK
    )


def _append_evidence(
    interpretation: InterpretationContract,
    observation: ObservationContract,
) -> list[EvidenceItem]:
    evidence = list(interpretation.evidence)
    additions = [
        EvidenceItem(
            source="observation",
            ref="body.rigidity_candidate",
            description="Il corpo resta rigido mentre mantiene la stessa direzione.",
        ),
        EvidenceItem(
            source="observation",
            ref="head_face.gaze_target",
            description="Testa e sguardo restano orientati verso lo stesso punto.",
        ),
        EvidenceItem(
            source="observation",
            ref="vocalization.type_candidates",
            description=(
                f"Si sentono {observation.vocalization.count} abbai direzionati."
                if observation.vocalization.count
                else "Si sentono abbai direzionati verso lo stesso punto."
            ),
        ),
    ]
    existing_refs = {item.ref for item in evidence}
    for item in additions:
        if item.ref not in existing_refs:
            evidence.append(item)
            existing_refs.add(item.ref)
        if len(evidence) >= 3:
            break
    return evidence[:5]


def ensure_bounded_behavior_reading(
    interpretation: InterpretationContract,
    observation: ObservationContract,
) -> InterpretationContract:
    """Promote a cautious alert reading when three independent signals agree."""
    if interpretation.primary_intent not in {None, IntentCode.INSUFFICIENT}:
        return interpretation

    rigid = (
        observation.body.rigidity_candidate is TriState.YES
        or observation.body.posture is Posture.STIFF
    )
    bark = (
        observation.vocalization.present is TriState.YES
        and VocalizationType.BARK in observation.vocalization.type_candidates
    )
    if (
        not rigid
        or not bark
        or not _directed_off_frame(observation)
        or _fear_or_avoidance_signal(observation)
    ):
        return interpretation

    alternatives = [
        item
        for item in interpretation.alternatives
        if item.intent is not IntentCode.ALERT_VIGILANCE
    ][:2]
    return interpretation.model_copy(
        update={
            "primary_intent": IntentCode.ALERT_VIGILANCE,
            "confidence_band": ConfidenceBand.LOW,
            "evidence": _append_evidence(interpretation, observation),
            "alternatives": alternatives,
        }
    )
