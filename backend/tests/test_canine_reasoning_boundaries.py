from datetime import UTC, datetime, timedelta

from app.api.routes.behavior import _consumer_evidence
from app.contracts.interpretation import EvidenceItem, InterpretationContract
from app.contracts.observation import ObservationContract, normalize_observation_dict
from app.contracts.taxonomy import ConfidenceBand, ContextBucket, IntentCode
from app.domains.behavior_decision import apply_behavior_decision_policy
from app.domains.digestive_intelligence import (
    DigestiveIntelligenceResult,
    govern_digestive_with_core,
)
from app.knowledge.models import (
    DogContextSnapshot,
    KnowledgeContext,
    LifeStageContext,
    LifestyleFact,
)
from app.knowledge.safety import (
    SAFE_DISTRESS_001,
    SAFE_ESCALATION_001,
    SAFE_PAIN_001,
    fired_safety_ids,
)
from app.providers.openai_reasoner import grounding_errors


def _context(*, health_context: list[LifestyleFact] | None = None) -> DogContextSnapshot:
    return DogContextSnapshot(
        dog_id="dog-1",
        name="Oreo",
        life_stage=LifeStageContext(
            value="MATURE_ADULT",
            source="PROFILE",
            confidence="HIGH",
        ),
        health_context=health_context or [],
    )


def _observation(**updates) -> ObservationContract:
    raw = {
        "observer_meta": {"provider": "test", "model": "test", "request_id": "b1"},
        "capture_quality": {"overall_quality": "good"},
        "body": {
            "body_height": "neutral",
            "posture": "loose",
            "rigidity_candidate": "no",
            "locomotion": "still",
            "approach_withdrawal_freeze": "none",
        },
        "head_face": {"mouth_state": "closed"},
        "ears": {"visible": "yes", "position": "neutral"},
        "tail": {"visible": "no"},
        "vocalization": {"present": "no"},
    }
    for key, value in updates.items():
        raw[key] = value
    return ObservationContract.model_validate(raw)


def _interpretation(intent: IntentCode) -> InterpretationContract:
    return InterpretationContract(
        primary_intent=intent,
        confidence_band=ConfidenceBand.MEDIUM,
        consumer_headline="Oreo è tranquillo e rilassato.",
        consumer_summary="Non sembra chiederti di cambiare qualcosa.",
        dog_voice="«Qui sto bene.»",
        evidence=[
            EvidenceItem(
                source="observation",
                ref="body.posture",
                description="Il corpo appare sciolto.",
            ),
            EvidenceItem(
                source="observation",
                ref="body.locomotion",
                description="Resta fermo.",
            ),
            EvidenceItem(
                source="observation",
                ref="head_face.mouth_state",
                description="Tiene la bocca chiusa.",
            ),
        ],
    )


def test_relaxed_reasoner_result_is_not_overridden_by_rule_table() -> None:
    interpretation = _interpretation(IntentCode.RELAX_REST)
    result, trace = apply_behavior_decision_policy(
        interpretation,
        _observation(),
        dog_name="Oreo",
        context_bucket=ContextBucket.HOME,
        knowledge=KnowledgeContext(registry_version="test", coverage="LOW", cards=[]),
    )
    assert result.primary_intent is IntentCode.RELAX_REST
    assert result.consumer_headline == interpretation.consumer_headline
    assert trace.copy_source == "REASONER"


def test_lowered_body_alone_is_not_distress() -> None:
    observation = _observation(
        body={
            "body_height": "lowered",
            "posture": "lowered",
            "rigidity_candidate": "no",
            "locomotion": "still",
            "approach_withdrawal_freeze": "none",
        }
    )
    assert SAFE_DISTRESS_001 not in fired_safety_ids(observation, _context())


def test_growl_during_observed_play_is_not_urgent_escalation() -> None:
    observation = _observation(
        scene={"visible_objects": ["tug toy"], "spatial_relations": ["dog pulls toy"]},
        body={
            "body_height": "neutral",
            "posture": "play_bow",
            "rigidity_candidate": "yes",
            "orientation_target": "person",
            "locomotion": "still",
            "approach_withdrawal_freeze": "approach",
        },
        vocalization={"present": "yes", "type_candidates": ["growl"]},
    )
    assert SAFE_ESCALATION_001 not in fired_safety_ids(observation, _context())


def test_old_pain_history_is_not_current_safety() -> None:
    old = LifestyleFact(
        key="lameness",
        value=True,
        provenance="OWNER_REPORTED",
        last_confirmed_at=datetime.now(UTC) - timedelta(days=60),
    )
    assert SAFE_PAIN_001 not in fired_safety_ids(_observation(), _context(health_context=[old]))


def test_current_pain_report_can_raise_safety() -> None:
    current = LifestyleFact(
        key="lameness",
        value=True,
        provenance="OWNER_REPORTED",
        last_confirmed_at=datetime.now(UTC),
    )
    assert SAFE_PAIN_001 in fired_safety_ids(
        _observation(), _context(health_context=[current])
    )


def test_observer_preserves_open_actions_and_ordered_transitions() -> None:
    raw = normalize_observation_dict(
        {
            "observer_meta": {
                "provider": "test",
                "model": "test",
                "request_id": "sequence",
            },
            "salient_actions": [
                {
                    "action": "looks at owner",
                    "start_ms": 0,
                    "end_ms": 500,
                    "description": "Dog looks at owner.",
                },
                {
                    "action": "looks at door",
                    "start_ms": 600,
                    "end_ms": 900,
                    "description": "Dog turns gaze to door.",
                },
            ],
            "transitions": [
                {
                    "from": "looks at owner",
                    "to": "looks at door",
                    "at_ms": 600,
                }
            ],
        }
    )
    observation = ObservationContract.model_validate(raw)
    assert [item.action for item in observation.salient_actions] == [
        "looks at owner",
        "looks at door",
    ]
    assert observation.transitions[0].to_observation == "looks at door"


def test_grounding_boundary_rejects_invisible_tail_claim() -> None:
    interpretation = _interpretation(IntentCode.RELAX_REST).model_copy(
        update={"consumer_summary": "La coda è bassa e il corpo è rilassato."}
    )
    errors = grounding_errors(interpretation, _observation())
    assert any(error["loc"] == ["tail"] for error in errors)


def test_internal_scientific_evidence_never_reaches_behavior_consumer() -> None:
    evidence = _consumer_evidence(
        {
            "evidence": [
                {"source": "scientific_kb", "description": "internal claim"},
                {"source": "observation", "description": "visible fact"},
            ]
        },
        {},
    )
    assert evidence == [{"source": "observation", "description": "visible fact"}]


def test_digestive_specialist_is_audited_by_shared_claim_core() -> None:
    result = DigestiveIntelligenceResult(
        overall_state="ROUTINE",
        consumer_headline="Le feci sono ben formate.",
        consumer_summary="Oggi la consistenza appare regolare.",
        baseline_comparison="Non ho ancora una baseline personale.",
        safety_state="ROUTINE",
        observation_reliability="La foto è chiara.",
        knowledge_claim_ids=["DIG_SCORE_2_001"],
    )
    governed, audit = govern_digestive_with_core(result)
    assert governed.consumer_headline == result.consumer_headline
    assert audit["claims"][0]["claim_id"] == "digestive-consumer-1"
    assert audit["validations"][0]["status"] in {
        "SUPPORTED",
        "PARTIALLY_SUPPORTED",
    }
