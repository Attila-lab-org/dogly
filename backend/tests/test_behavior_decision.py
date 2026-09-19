from app.contracts.interpretation import (
    AlternativeIntent,
    ContextOption,
    EvidenceItem,
    InterpretationContract,
    SafetyFlag,
)
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ConfidenceBand, ContextBucket, IntentCode
from app.domains.behavior_decision import apply_behavior_decision_policy
from app.knowledge.models import KnowledgeContext


def _knowledge(coverage: str = "HIGH") -> KnowledgeContext:
    return KnowledgeContext(
        registry_version="test",
        coverage=coverage,
        cards=[],
    )


def _interpretation(
    intent: IntentCode | None = IntentCode.INSUFFICIENT,
    *,
    confidence: ConfidenceBand = ConfidenceBand.LOW,
) -> InterpretationContract:
    return InterpretationContract(
        primary_intent=intent,
        confidence_band=confidence,
        consumer_headline="Non scelgo ancora una lettura.",
        consumer_summary="Vedo alcuni segnali ma non scelgo una lettura.",
        dog_voice="«Sto osservando qualcosa.»",
        evidence=(
            []
            if intent in {None, IntentCode.INSUFFICIENT}
            else [
                EvidenceItem(
                    source="observation",
                    ref=f"signal.{index}",
                    description=f"Segnale {index}.",
                )
                for index in range(3)
            ]
        ),
        alternatives=[
            AlternativeIntent(
                intent=IntentCode.ALERT_VIGILANCE,
                rationale="I segnali sono compatibili con allerta.",
            )
        ],
    )


def _observation(
    *,
    orientation: str = "off-screen left",
    lowered: bool = False,
) -> ObservationContract:
    return ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "test",
                "model": "test",
                "request_id": "oreo-alert",
            },
            "capture_quality": {
                "overall_quality": "good",
                "audio_quality": "good",
                "dog_visible_fraction": 0.85,
            },
            "body": {
                "body_height": "lowered" if lowered else "neutral",
                "posture": "crouch" if lowered else "stiff",
                "rigidity_candidate": "yes",
                "orientation_target": orientation,
                "weight_shift": "forward",
                "locomotion": "still",
                "approach_withdrawal_freeze": (
                    "withdrawal" if lowered else "none"
                ),
            },
            "head_face": {
                "head_orientation": orientation,
                "gaze_target": orientation,
            },
            "ears": {"position": "flat_back" if lowered else "forward"},
            "tail": {
                "visible": "yes" if lowered else "no",
                "neutral_relative_height": "tucked" if lowered else "unknown",
            },
            "vocalization": {
                "present": "yes",
                "type_candidates": ["bark"],
                "count": 3,
                "intensity": "moderate",
                "rhythm": "intermittent",
            },
        }
    )


def _maya_garden_observation() -> ObservationContract:
    return ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "test",
                "model": "test",
                "request_id": "maya-garden",
            },
            "capture_quality": {
                "overall_quality": "degraded",
                "audio_quality": "absent",
                "dog_visible_fraction": 0.72,
            },
            "scene": {
                "dog_count": 1,
                "human_count": 0,
                "visible_objects": ["grass", "gravel", "stone_wall", "plant"],
                "environment_class": "outdoor",
                "spatial_relations": ["dog moves towards camera"],
            },
            "body": {
                "posture": "loose",
                "locomotion": "still",
                "body_height": "neutral",
                "orientation_target": "camera",
                "rigidity_candidate": "no",
                "approach_withdrawal_freeze": "approach",
            },
            "head_face": {
                "head_orientation": "towards_camera",
                "gaze_target": "camera",
            },
            "ears": {"visible": "yes", "position": "neutral_forward"},
            "tail": {
                "visible": "yes",
                "movement": "wagging",
                "neutral_relative_height": "neutral",
                "speed_amp_qualitative": "slow gentle wag",
            },
            "vocalization": {"present": "unknown", "type_candidates": []},
            "timeline": [
                {
                    "start_ms": 0,
                    "end_ms": 8800,
                    "observed_changes": [
                        "Dog stands facing camera with tail gently wagging."
                    ],
                },
                {
                    "start_ms": 8800,
                    "end_ms": 12500,
                    "observed_changes": ["Dog runs past the camera."],
                },
            ],
        }
    )


def test_candidate_rules_audit_but_do_not_promote_reasoner_abstention():
    result, trace = apply_behavior_decision_policy(
        _interpretation(),
        _observation(),
        dog_name="Oreo",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge(),
    )

    assert result.primary_intent is IntentCode.INSUFFICIENT
    assert result.confidence_band is ConfidenceBand.LOW
    assert trace.resolution == "ABSTAINED"
    alert = next(
        item for item in trace.candidates if item.intent is IntentCode.ALERT_VIGILANCE
    )
    assert alert.eligible is True
    assert len(alert.signal_families) >= 3


def test_looking_left_alone_is_not_treated_as_off_frame_evidence():
    result, trace = apply_behavior_decision_policy(
        _interpretation(),
        _observation(orientation="left"),
        dog_name="Oreo",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge(),
    )

    assert result.primary_intent is IntentCode.INSUFFICIENT
    assert trace.resolution == "ABSTAINED"


def test_fear_and_avoidance_exclude_automatic_alert_promotion():
    result, trace = apply_behavior_decision_policy(
        _interpretation(),
        _observation(lowered=True),
        dog_name="Oreo",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge(),
    )

    assert result.primary_intent is IntentCode.INSUFFICIENT
    alert = next(
        item for item in trace.candidates if item.intent is IntentCode.ALERT_VIGILANCE
    )
    assert alert.eligible is False
    assert alert.excluded_by


def test_scientific_coverage_does_not_cap_reasoner_confidence():
    result, trace = apply_behavior_decision_policy(
        _interpretation(
            IntentCode.ALERT_VIGILANCE,
            confidence=ConfidenceBand.HIGH,
        ),
        _observation(),
        dog_name="Oreo",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge("MEDIUM"),
    )

    assert result.primary_intent is IntentCode.ALERT_VIGILANCE
    assert result.confidence_band is ConfidenceBand.HIGH
    assert trace.confidence_ceiling is ConfidenceBand.HIGH


def test_boundary_audit_does_not_rewrite_reasoner_copy():
    interpretation = _interpretation(IntentCode.ALERT_VIGILANCE).model_copy(
        update={
            "consumer_headline": (
                "Oreo è rigido e abbaia verso qualcosa a sinistra fuori campo"
            ),
            "consumer_summary": (
                "Il corpo è rigido, il peso è in avanti e produce tre abbai."
            ),
        }
    )
    result, trace = apply_behavior_decision_policy(
        interpretation,
        _observation(),
        dog_name="Oreo",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge(),
    )

    assert result.primary_intent is IntentCode.ALERT_VIGILANCE
    assert result.consumer_headline == (
        "Oreo è rigido e abbaia verso qualcosa a sinistra fuori campo"
    )
    assert "corpo è rigido" in result.consumer_summary.casefold()
    assert trace.copy_source == "REASONER"


def test_policy_never_creates_intent_from_profile_or_breed_alone():
    observation = ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "test",
                "model": "test",
                "request_id": "breed-only",
            },
            "capture_quality": {
                "overall_quality": "good",
                "dog_visible_fraction": 1,
            },
        }
    )
    result, trace = apply_behavior_decision_policy(
        _interpretation(),
        observation,
        dog_name="Oreo",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge(),
    )

    assert result.primary_intent is IntentCode.INSUFFICIENT
    assert not any(item.eligible for item in trace.candidates)


def test_maya_garden_case_is_not_reinterpreted_by_closed_rules():
    interpretation = _interpretation(IntentCode.HIGH_AROUSAL).model_copy(
        update={
            "consumer_headline": "Un picco di energia",
            "consumer_summary": "Maya sembra molto attivata e corre oltre.",
            "dog_voice": "«Corro via!»",
            "needs_context": True,
            "context_question": "Stava andando verso la porta?",
            "context_options": [
                ContextOption(id="yes", label="Sì, verso la porta"),
                ContextOption(id="no", label="No, ha fatto un giro"),
            ],
            "alternatives": [
                AlternativeIntent(
                    intent=IntentCode.PLAY_INTERACTION,
                    rationale="Corpo sciolto e coda morbida.",
                ),
                AlternativeIntent(
                    intent=IntentCode.ATTENTION_REQUEST,
                    rationale="Si avvicina alla persona.",
                ),
            ],
        }
    )

    result, trace = apply_behavior_decision_policy(
        interpretation,
        _maya_garden_observation(),
        dog_name="Maya",
        context_bucket=ContextBucket.DOOR_EXIT,
        knowledge=_knowledge("MEDIUM"),
    )

    assert result.primary_intent is IntentCode.HIGH_AROUSAL
    assert result.consumer_headline == "Un picco di energia"
    assert result.needs_context is True
    assert result.context_question == "Stava andando verso la porta?"
    assert trace.resolution == "ACCEPTED_REASONER"
    arousal = next(
        item for item in trace.candidates if item.intent is IntentCode.HIGH_AROUSAL
    )
    play = next(
        item for item in trace.candidates if item.intent is IntentCode.PLAY_INTERACTION
    )
    outside = next(
        item for item in trace.candidates if item.intent is IntentCode.OUTSIDE_REQUEST
    )
    assert arousal.eligible is False
    assert play.eligible is True
    assert "context.door_exit" not in outside.supporting_signals

    refined, _ = apply_behavior_decision_policy(
        interpretation.model_copy(
            update={
                "context_effect": "Hai chiarito che Maya stava facendo un giro.",
                "needs_context": False,
                "context_question": None,
                "context_options": [],
            }
        ),
        _maya_garden_observation(),
        dog_name="Maya",
        context_bucket=ContextBucket.OUTDOORS,
        knowledge=_knowledge("MEDIUM"),
    )
    assert refined.needs_context is False
    assert refined.context_question is None


def test_ineligible_rule_candidate_does_not_force_abstention():
    interpretation = _interpretation(IntentCode.HIGH_AROUSAL).model_copy(
        update={"alternatives": []}
    )
    result, trace = apply_behavior_decision_policy(
        interpretation,
        _maya_garden_observation(),
        dog_name="Maya",
        context_bucket=ContextBucket.OUTDOORS,
        knowledge=_knowledge("MEDIUM"),
    )
    assert result.primary_intent is IntentCode.HIGH_AROUSAL
    assert trace.resolution == "ACCEPTED_REASONER"


def test_safety_flag_preserves_reasoner_primary():
    interpretation = _interpretation(IntentCode.HIGH_AROUSAL).model_copy(
        update={
            "alternatives": [
                AlternativeIntent(
                    intent=IntentCode.PLAY_INTERACTION,
                    rationale="Corpo sciolto e coda morbida.",
                )
            ],
            "safety_flags": [
                SafetyFlag(code="SAFE_ESCALATION_001", severity="urgent")
            ],
        }
    )
    result, trace = apply_behavior_decision_policy(
        interpretation,
        _maya_garden_observation(),
        dog_name="Maya",
        context_bucket=ContextBucket.OUTDOORS,
        knowledge=_knowledge("MEDIUM"),
    )
    assert result.primary_intent is IntentCode.HIGH_AROUSAL
    assert trace.resolution == "SAFETY_PRESERVED"


def _unwell_approach_observation() -> ObservationContract:
    return ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "test",
                "model": "test",
                "request_id": "unwell-approach",
            },
            "capture_quality": {
                "overall_quality": "good",
                "audio_quality": "good",
                "dog_visible_fraction": 0.9,
            },
            "body": {
                "posture": "crouch",
                "body_height": "lowered",
                "locomotion": "still",
                "orientation_target": "owner",
                "rigidity_candidate": "no",
                "approach_withdrawal_freeze": "approach",
            },
            "head_face": {
                "head_orientation": "owner",
                "gaze_target": "owner",
                "lip_lick_candidate": "yes",
            },
            "ears": {"position": "back"},
            "tail": {
                "visible": "yes",
                "neutral_relative_height": "below",
                "movement": "still",
            },
            "vocalization": {
                "present": "yes",
                "type_candidates": ["whine"],
                "count": 2,
            },
        }
    )


def test_rules_do_not_replace_reasoner_with_discomfort_label():
    """The differential belongs in the model, not a post-model rule table."""
    interpretation = _interpretation(IntentCode.PLAY_INTERACTION).model_copy(
        update={
            "consumer_headline": "Vuole giocare",
            "alternatives": [
                AlternativeIntent(
                    intent=IntentCode.DISCOMFORT_AVOIDANCE,
                    rationale="Corpo abbassato e leccate al muso.",
                ),
                AlternativeIntent(
                    intent=IntentCode.ATTENTION_REQUEST,
                    rationale="Si avvicina al proprietario.",
                ),
                AlternativeIntent(
                    intent=IntentCode.PLAY_INTERACTION,
                    rationale="Si avvicina.",
                ),
            ],
        }
    )
    result, trace = apply_behavior_decision_policy(
        interpretation,
        _unwell_approach_observation(),
        dog_name="Maya",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge("MEDIUM"),
    )

    assert result.primary_intent is IntentCode.PLAY_INTERACTION
    assert result.consumer_headline == "Vuole giocare"
    discomfort = next(
        item
        for item in trace.candidates
        if item.intent is IntentCode.DISCOMFORT_AVOIDANCE
    )
    assert discomfort.eligible is True
    play = next(
        item for item in trace.candidates if item.intent is IntentCode.PLAY_INTERACTION
    )
    assert play.eligible is False
