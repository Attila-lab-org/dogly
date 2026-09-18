from app.contracts.interpretation import (
    AlternativeIntent,
    EvidenceItem,
    InterpretationContract,
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


def test_unique_grounded_candidate_can_promote_reasoner_abstention():
    result, trace = apply_behavior_decision_policy(
        _interpretation(),
        _observation(),
        dog_name="Oreo",
        context_bucket=ContextBucket.UNKNOWN,
        knowledge=_knowledge(),
    )

    assert result.primary_intent is IntentCode.ALERT_VIGILANCE
    assert result.confidence_band is ConfidenceBand.LOW
    assert "fuori campo" in result.consumer_headline
    assert trace.resolution == "PROMOTED_BOUNDED_CANDIDATE"
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


def test_medium_scientific_coverage_caps_high_confidence():
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
    assert result.confidence_band is ConfidenceBand.MEDIUM
    assert trace.confidence_ceiling is ConfidenceBand.MEDIUM


def test_observation_inventory_is_replaced_before_it_reaches_the_composer():
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
    assert result.consumer_headline == "Oreo sembra molto attento a qualcosa fuori campo"
    assert "corpo è rigido" not in result.consumer_summary.casefold()
    assert trace.copy_source == "DECISION_FALLBACK"


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
