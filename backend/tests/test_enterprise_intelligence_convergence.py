"""Enterprise Intelligence Convergence scenario matrix."""

from __future__ import annotations

from datetime import UTC, datetime

from app.api.routes.behavior import event_out
from app.contracts.interpretation import (
    AlternativeIntent,
    ContextOption,
    EvidenceItem,
    InterpretationContract,
    PersonalMemoryUsed,
    SafetyFlag,
)
from app.contracts.taxonomy import ConfidenceBand, IntentCode
from app.domains.behavior_intelligence import build_behavior_consumer
from app.domains.digestive_intelligence import (
    DigestiveContext,
    build_digestive_intelligence,
)
from app.domains.dog_context import build_dog_context
from app.domains.models import BehaviorEventRec, DogRec
from app.knowledge.advice import build_advice
from app.knowledge.models import KnowledgeContext
from app.knowledge.safety import SAFE_ESCALATION_001


def _dog() -> DogRec:
    return DogRec(
        id="dog-1",
        owner_id="user-1",
        name="Rocky",
        created_at=datetime.now(UTC),
    )


def _observation(**updates):
    value = {
        "image_quality": "sufficient",
        "warnings": [],
        "fecal_score_estimate": 4,
        "consistency": "soft",
        "fresh_blood_candidate": "none_observed",
        "melena_candidate": "none_observed",
        "foreign_material_candidate": "none_observed",
    }
    value.update(updates)
    return value


def _interpretation(**updates) -> InterpretationContract:
    payload = {
        "primary_intent": IntentCode.ATTENTION_REQUEST,
        "confidence_band": ConfidenceBand.MEDIUM,
        "consumer_headline": "Rocky cerca il tuo sguardo",
        "dog_voice": "«Mi dedichi un momento?»",
        "consumer_summary": "Ti guarda e torna verso di te più volte.",
        "evidence": [
            EvidenceItem(source="observation", description=f"segno {index}")
            for index in range(3)
        ],
        "safety_flags": [],
        "personal_memory_used": [],
        "alternatives": [
            AlternativeIntent(
                intent=IntentCode.PLAY_INTERACTION,
                rationale="Potrebbe anche essere un invito al gioco.",
            )
        ],
    }
    payload.update(updates)
    return InterpretationContract.model_validate(payload)


def test_dominant_reading_keeps_bounded_alternatives_for_owner_correction():
    result = build_behavior_consumer(
        _interpretation(),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    assert result.consumer_evidence
    assert all(item.source.value == "observation" for item in result.consumer_evidence)
    assert len(result.consumer_alternatives) == 1
    assert result.consumer_alternatives[0].intent is IntentCode.PLAY_INTERACTION


def test_ambiguous_reading_keeps_material_alternatives():
    result = build_behavior_consumer(
        _interpretation(
            primary_intent=IntentCode.AMBIGUOUS,
            consumer_headline="Ci sono due spiegazioni possibili",
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    assert len(result.consumer_alternatives) == 1
    assert result.consumer_alternatives[0].intent is IntentCode.PLAY_INTERACTION


def test_safety_suppresses_consumer_alternatives():
    result = build_behavior_consumer(
        _interpretation(
            primary_intent=IntentCode.AMBIGUOUS,
            safety_flags=[SafetyFlag(code=SAFE_ESCALATION_001, severity="urgent")],
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    assert result.safety is not None
    assert result.consumer_alternatives == []


def test_event_out_exposes_consumer_projection_not_raw_audit():
    consumer = build_behavior_consumer(
        _interpretation(),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    event = BehaviorEventRec(
        id="evt-1",
        capture_id="cap-1",
        dog_id="dog-1",
        user_id="user-1",
        status="COMPLETED",
        created_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        primary_intent=IntentCode.ATTENTION_REQUEST,
        confidence_band=ConfidenceBand.MEDIUM,
        summary="Ti guarda.",
        interpretation_json={
            "schema_version": "interpretation.v1",
            "primary_intent": "ATTENTION_REQUEST",
            "confidence_band": "MEDIUM",
            "consumer_headline": "Rocky cerca il tuo sguardo",
            "dog_voice": "«Mi dedichi un momento?»",
            "consumer_summary": "Ti guarda.",
            "alternatives": [
                {
                    "intent": "PLAY_INTERACTION",
                    "rationale": "raw audit alternative",
                }
            ],
            "evidence": [
                {"source": "observation", "description": "segno 1"},
                {"source": "observation", "description": "segno 2"},
                {"source": "observation", "description": "segno 3"},
            ],
            "safety_flags": [],
            "needs_context": False,
            "consumer": consumer.model_dump(mode="json"),
        },
    )
    body = event_out(event)
    assert len(body.alternatives) == 1
    assert body.alternatives[0].intent is IntentCode.PLAY_INTERACTION
    assert body.evidence
    assert all(item.source.value == "observation" for item in body.evidence)


def test_advice_waits_while_context_question_is_useful():
    advice = build_advice(
        _interpretation(
            needs_context=True,
            context_question="Cosa stava guardando?",
            context_options=[
                ContextOption(id="person", label="Una persona"),
                ContextOption(id="unsure", label="Non sono sicuro"),
            ],
        ),
        build_dog_context(_dog()),
        KnowledgeContext(registry_version="2.0", coverage="HIGH"),
    )
    assert advice is None


def test_advice_limits_to_monitor_when_contradictions_present():
    advice = build_advice(
        _interpretation(contradictions=["segnali misti tra gioco e tensione"]),
        build_dog_context(_dog()),
        KnowledgeContext(registry_version="2.0", coverage="HIGH"),
    )
    assert advice is None or advice.category == "MONITOR"


def test_stable_recognized_routine_does_not_force_another_recording():
    advice = build_advice(
        _interpretation(
            personal_memory_used=[
                PersonalMemoryUsed(
                    pattern_id="p1",
                    state="ESTABLISHED",
                    support_summary="richiesta attenzione confermata",
                )
            ]
        ),
        build_dog_context(_dog()),
        KnowledgeContext(registry_version="2.0", coverage="LOW"),
    )
    assert advice is None or advice.code != "ADVICE_MONITOR_BASELINE_CHANGE"


def test_first_digestive_analysis_is_useful_without_history():
    result = build_digestive_intelligence(
        _observation(),
        DigestiveContext(dog_name="Rocky"),
    )
    assert result.consumer_headline
    assert result.consumer_summary
    assert result.recommended_next_step
    assert result.interpretation_layers
    assert result.interpretation_layers[0].key == "general"
    blob = f"{result.consumer_headline} {result.consumer_summary}".lower()
    assert "ripetendo" not in blob


def test_formed_repetition_near_baseline_is_stable_routine_not_change():
    result = build_digestive_intelligence(
        _observation(consistency="formed", fecal_score_estimate=3),
        DigestiveContext(
            dog_name="Rocky",
            prior_scores=[3, 3, 3, 3],
            prior_consistencies=["formed", "formed", "formed"],
        ),
    )
    blob = (
        f"{result.consumer_headline} {result.consumer_summary} "
        f"{result.recommended_next_step}"
    ).lower()
    assert "ripetendo" not in blob
    assert result.baseline_comparison == "NEAR_USUAL"


def test_soft_repetition_reads_as_not_yet_stabilized():
    result = build_digestive_intelligence(
        _observation(consistency="soft", fecal_score_estimate=4),
        DigestiveContext(
            dog_name="Rocky",
            prior_scores=[2, 2, 2, 2],
            prior_consistencies=["soft", "soft"],
        ),
    )
    blob = f"{result.consumer_headline} {result.consumer_summary}".lower()
    assert "non si è ancora stabilizzata" in blob


def test_food_change_stays_temporal_association_not_cause():
    result = build_digestive_intelligence(
        _observation(consistency="soft", fecal_score_estimate=4),
        DigestiveContext(
            dog_name="Rocky",
            prior_scores=[2, 2, 2, 2],
            active_food_name="Salmone",
            has_active_food=True,
            quantity_per_day="200g",
            food_started_days_ago=3,
        ),
    )
    blob = (
        f"{result.consumer_summary} {' '.join(result.possible_associations)}"
    ).lower()
    assert "causa" not in blob
