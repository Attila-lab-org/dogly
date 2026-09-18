from app.contracts.interpretation import (
    AlternativeIntent,
    EvidenceItem,
    InterpretationContract,
)
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ConfidenceBand, IntentCode
from app.domains.behavior_reasoning import ensure_bounded_behavior_reading


def _interpretation(intent=IntentCode.INSUFFICIENT):
    return InterpretationContract(
        primary_intent=intent,
        confidence_band=ConfidenceBand.LOW,
        consumer_headline="Non scelgo ancora una lettura.",
        consumer_summary="Vedo alcuni segnali ma non scelgo una lettura.",
        dog_voice="«Sto osservando qualcosa.»",
        evidence=[
            EvidenceItem(
                source="observation",
                description="Il corpo resta rigido.",
            ),
            EvidenceItem(
                source="observation",
                description="Si sentono alcuni abbai.",
            ),
            EvidenceItem(
                source="observation",
                description="Lo sguardo resta orientato fuori campo.",
            ),
        ],
        alternatives=[
            AlternativeIntent(
                intent=IntentCode.ALERT_VIGILANCE,
                rationale="I segnali sono compatibili con allerta.",
            )
        ],
    )


def _observation(**overrides):
    payload = {
        "observer_meta": {
            "provider": "test",
            "model": "test",
            "request_id": "oreo-alert",
        },
        "capture_quality": {
            "overall_quality": "degraded",
            "audio_quality": "good",
            "dog_visible_fraction": 0.85,
        },
        "body": {
            "posture": "stiff",
            "rigidity_candidate": "yes",
            "orientation_target": "off-screen left",
            "weight_shift": "forward",
            "locomotion": "still",
            "approach_withdrawal_freeze": "none",
        },
        "head_face": {
            "head_orientation": "turned left",
            "gaze_target": "off-screen left",
        },
        "ears": {"position": "forward"},
        "tail": {"visible": "no"},
        "vocalization": {
            "present": "yes",
            "type_candidates": ["bark"],
            "count": 3,
            "relative_pitch": "low",
            "intensity": "moderate",
            "rhythm": "intermittent",
        },
    }
    for key, value in overrides.items():
        payload[key] = value
    return ObservationContract.model_validate(payload)


def test_rigidity_direction_and_barks_guarantee_a_bounded_alert_reading():
    result = ensure_bounded_behavior_reading(
        _interpretation(),
        _observation(),
    )

    assert result.primary_intent is IntentCode.ALERT_VIGILANCE
    assert result.confidence_band is ConfidenceBand.LOW
    assert len(result.evidence) >= 3
    assert all(
        item.intent is not IntentCode.ALERT_VIGILANCE
        for item in result.alternatives
    )


def test_bark_without_rigidity_does_not_force_alert():
    result = ensure_bounded_behavior_reading(
        _interpretation(),
        _observation(
            body={
                "posture": "loose",
                "rigidity_candidate": "no",
                "orientation_target": "off-screen left",
            }
        ),
    )

    assert result.primary_intent is IntentCode.INSUFFICIENT


def test_fear_or_avoidance_signals_are_not_overwritten_as_alert():
    result = ensure_bounded_behavior_reading(
        _interpretation(),
        _observation(
            body={
                "posture": "crouch",
                "body_height": "lowered",
                "rigidity_candidate": "yes",
                "orientation_target": "off-screen left",
                "approach_withdrawal_freeze": "withdrawal",
            },
            tail={"visible": "yes", "neutral_relative_height": "tucked"},
        ),
    )

    assert result.primary_intent is IntentCode.INSUFFICIENT


def test_existing_resolved_intent_is_never_overwritten():
    result = ensure_bounded_behavior_reading(
        _interpretation(IntentCode.FRUSTRATION),
        _observation(),
    )

    assert result.primary_intent is IntentCode.FRUSTRATION
