"""Consumer composer V2: Per Rocky, safety actions, baseline."""

from datetime import UTC, datetime

from app.contracts.interpretation import (
    EvidenceItem,
    InterpretationContract,
    PersonalMemoryUsed,
    SafetyFlag,
)
from app.contracts.taxonomy import ConfidenceBand, IntentCode
from app.domains.behavior_intelligence import (
    BaselineComparison,
    build_behavior_consumer,
)
from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec
from app.knowledge.models import AdviceItem
from app.knowledge.safety import SAFE_ESCALATION_001


def _dog() -> DogRec:
    return DogRec(
        id="dog-1",
        owner_id="user-1",
        name="Rocky",
        created_at=datetime.now(UTC),
    )


def _interpretation(**updates) -> InterpretationContract:
    payload = {
        "primary_intent": IntentCode.ATTENTION_REQUEST,
        "confidence_band": ConfidenceBand.MEDIUM,
        "consumer_summary": "Ti guarda e torna verso di te più volte.",
        "evidence": [
            EvidenceItem(source="observation", description=f"segno {index}")
            for index in range(3)
        ],
        "safety_flags": [],
        "personal_memory_used": [],
    }
    payload.update(updates)
    return InterpretationContract.model_validate(payload)


def test_new_dog_says_still_learning():
    result = build_behavior_consumer(
        _interpretation(),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    assert result.baseline_comparison is BaselineComparison.LEARNING
    assert "imparando" in result.baseline_note
    assert "Rocky sembra voler attirare la tua attenzione" == result.consumer_headline
    assert result.safety is None


def test_checkin_off_is_personal_variation():
    context = build_dog_context(
        _dog(),
        {
            "routine": {
                "today_vs_usual": {
                    "concern": "off",
                    "note": "non è come al solito",
                    "day": datetime.now(UTC).date().isoformat(),
                }
            }
        },
    )
    result = build_behavior_consumer(
        _interpretation(),
        dog_name="Rocky",
        dog_context=context,
    )
    assert result.baseline_comparison is BaselineComparison.VARIATION
    assert "diverso dal solito" in result.baseline_note


def test_stale_checkin_is_ignored():
    context = build_dog_context(
        _dog(),
        {
            "routine": {
                "today_vs_usual": {
                    "concern": "off",
                    "day": "2020-01-01",
                }
            }
        },
    )
    assert context.today_vs_usual == []


def test_serene_checkin_is_not_a_disruption():
    context = build_dog_context(
        _dog(),
        {
            "routine": {
                "today_vs_usual": {
                    "concern": "soft",
                    "day": datetime.now(UTC).date().isoformat(),
                }
            }
        },
    )
    assert context.today_vs_usual == []


def test_confirmed_pattern_is_recognized():
    result = build_behavior_consumer(
        _interpretation(
            personal_memory_used=[
                PersonalMemoryUsed(
                    pattern_id="p1",
                    state="ESTABLISHED",
                    support_summary="attenzione confermata",
                )
            ]
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    assert result.baseline_comparison is BaselineComparison.RECOGNIZED
    assert "già confermato" in result.baseline_note


def test_escalation_flag_commands_distance_not_a_code():
    result = build_behavior_consumer(
        _interpretation(
            primary_intent=IntentCode.RESOURCE_TENSION,
            safety_flags=[
                SafetyFlag(code=SAFE_ESCALATION_001, severity="urgent")
            ],
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
        advice=None,
    )
    assert result.safety is not None
    assert result.safety.code == SAFE_ESCALATION_001
    assert "SAFE_" not in result.safety.action
    assert "distanza" in result.safety.action.lower()
    assert result.recommended_next_step == result.safety.action
    assert "chiedere più spazio" in result.consumer_headline


def test_advice_follow_up_becomes_what_to_watch():
    advice = AdviceItem(
        code="ADVICE_ATTENTION_MOMENT",
        category="ROUTINE",
        action="Dedicagli qualche minuto e osserva cosa fa dopo.",
        rationale="Richiesta di attenzione a basso rischio.",
        follow_up="Se va verso la porta o un gioco, salvalo.",
        source_ids=["S01"],
        risk="LOW",
    )
    result = build_behavior_consumer(
        _interpretation(),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
        advice=advice,
    )
    assert result.recommended_next_step == advice.action
    assert "porta" in result.what_to_watch


def test_insufficient_result_gives_a_concrete_retry_action():
    result = build_behavior_consumer(
        _interpretation(
            primary_intent=None,
            confidence_band=ConfidenceBand.LOW,
            evidence=[],
            consumer_summary="Non ci sono abbastanza segnali visibili.",
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    assert (
        result.consumer_headline
        == "Non ho abbastanza elementi per capirlo bene"
    )
    assert "altro breve video" in (result.recommended_next_step or "")
