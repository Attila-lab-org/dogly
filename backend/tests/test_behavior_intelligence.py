"""Consumer composer V2: Per Rocky, safety actions, baseline."""

from datetime import UTC, datetime

from app.api.routes.behavior import event_out
from app.contracts.interpretation import (
    AlternativeIntent,
    EvidenceItem,
    InterpretationContract,
    PersonalMemoryUsed,
    SafetyFlag,
)
from app.contracts.taxonomy import ConfidenceBand, IntentCode
from app.domains.behavior_intelligence import (
    BEHAVIOR_CONSUMER_VERSION,
    BaselineComparison,
    build_behavior_consumer,
)
from app.domains.dog_context import build_dog_context
from app.domains.models import BehaviorEventRec, DogRec
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
        "consumer_headline": "Rocky cerca il tuo sguardo",
        "dog_voice": "«Mi dedichi un momento?»",
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
    assert "Rocky cerca il tuo sguardo" == result.consumer_headline
    assert "torna verso di te" in result.consumer_summary
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


def test_preliminary_pattern_never_claims_owner_confirmation():
    result = build_behavior_consumer(
        _interpretation(
            personal_memory_used=[
                PersonalMemoryUsed(
                    pattern_id="p1",
                    state="PRELIMINARY",
                    support_summary="support=4 confirm=0",
                )
            ]
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )
    assert result.baseline_comparison is BaselineComparison.LEARNING
    assert "servono ancora le tue conferme" in result.baseline_note
    assert "support=" not in result.baseline_note


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


def test_composer_does_not_promote_an_ungoverned_partial_reading():
    result = build_behavior_consumer(
        _interpretation(
            primary_intent=IntentCode.INSUFFICIENT,
            confidence_band=ConfidenceBand.LOW,
            consumer_headline=(
                "Rocky appare teso e molto attento a qualcosa fuori campo"
            ),
            dog_voice="«Potrei aver bisogno di osservare prima di avvicinarmi.»",
            consumer_summary=(
                "Il corpo è rigido, resta fermo e tiene la coda alta. "
                "Non vediamo che cosa stia osservando."
            ),
            evidence=[
                EvidenceItem(
                    source="observation",
                    description="Il corpo resta rigido.",
                ),
                EvidenceItem(
                    source="observation",
                    description="Resta fermo con la coda alta.",
                ),
            ],
            alternatives=[
                AlternativeIntent(
                    intent=IntentCode.ALERT_VIGILANCE,
                    rationale="La postura ferma è compatibile con molta attenzione.",
                )
            ],
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )

    assert result.consumer_headline == "Non ho abbastanza elementi per capirlo bene"
    assert "altro breve video" in (result.recommended_next_step or "")
    assert result.consumer_alternatives[0].intent is IntentCode.ALERT_VIGILANCE


def test_composer_preserves_the_governed_clip_specific_copy():
    result = build_behavior_consumer(
        _interpretation(
            primary_intent=IntentCode.ALERT_VIGILANCE,
            consumer_headline=(
                "Rocky è rigido e abbaia verso qualcosa a sinistra fuori campo"
            ),
            consumer_summary=(
                "Il corpo è rigido, il peso è in avanti e produce tre abbai bassi."
            ),
            dog_voice="«Vedo qualcosa a sinistra.»",
        ),
        dog_name="Rocky",
        dog_context=build_dog_context(_dog()),
    )

    assert (
        result.consumer_headline
        == "Rocky è rigido e abbaia verso qualcosa a sinistra fuori campo"
    )
    assert "tre abbai" in result.consumer_summary


def test_recent_partial_result_is_repaired_when_read_from_the_api():
    interpretation = _interpretation(
        primary_intent=IntentCode.INSUFFICIENT,
        confidence_band=ConfidenceBand.LOW,
        consumer_headline="Rocky appare teso e osserva qualcosa fuori campo",
        dog_voice="«Potrei essere molto attento e un po’ agitato.»",
        evidence=[
            EvidenceItem(
                source="observation",
                description="Il corpo resta rigido.",
            ),
            EvidenceItem(
                source="observation",
                description="Resta fermo con la coda alta.",
            ),
        ],
        alternatives=[
            AlternativeIntent(
                intent=IntentCode.ALERT_VIGILANCE,
                rationale="La postura ferma è compatibile con molta attenzione.",
            )
        ],
        needs_context=True,
        context_question="C’era qualcuno vicino a Rocky?",
        context_options=[
            {"id": "person", "label": "Sì, una persona"},
            {"id": "nobody", "label": "No, nessuno"},
        ],
    )
    payload = interpretation.model_dump(mode="json")
    payload["consumer"] = {
        "consumer_headline": "Rocky è in allerta e sta segnalando qualcosa",
        "consumer_summary": (
            "Rocky ha probabilmente percepito qualcosa e ti sta avvisando."
        ),
        "dog_voice": "«C’è qualcosa qui: voglio che tu lo sappia.»",
        "composer_version": BEHAVIOR_CONSUMER_VERSION,
        "recommended_next_step": "Registra un altro video.",
    }
    now = datetime.now(UTC)

    result = event_out(
        BehaviorEventRec(
            id="event-1",
            capture_id="capture-1",
            dog_id="dog-1",
            user_id="user-1",
            status="COMPLETED",
            primary_intent=IntentCode.INSUFFICIENT,
            confidence_band=ConfidenceBand.LOW,
            summary=interpretation.consumer_summary,
            interpretation_json=payload,
            observation_json={
                "capture_quality": {"audio_quality": "degraded"},
                "vocalization": {"type_candidates": ["bark"]},
            },
            created_at=now,
            completed_at=now,
        )
    )

    assert result.consumer_headline == "Rocky è in allerta e sta segnalando qualcosa"
    assert "qualcosa" in (result.dog_voice or "")
    assert "ti sta avvisando" in (result.summary or "")
    assert result.recommended_next_step is None
    assert "possibile abbaio" in (result.sound_note or "")
    assert "non è abbastanza nitido" in (result.sound_note or "")


def test_legacy_alert_result_is_upgraded_when_read_from_the_api():
    interpretation = _interpretation(
        primary_intent=IntentCode.ALERT_VIGILANCE,
        consumer_headline=(
            "Oreo osserva una persona fuori campo e abbaia con postura tesa"
        ),
        consumer_summary=(
            "Oreo ha il corpo rigido, il peso in avanti e produce tre abbai bassi."
        ),
    )
    payload = interpretation.model_dump(mode="json")
    payload["consumer"] = {
        "consumer_headline": interpretation.consumer_headline,
        "consumer_summary": interpretation.consumer_summary,
        "dog_voice": interpretation.dog_voice,
        "composer_version": "behavior-consumer/v1",
        "recommended_next_step": "Se ricapita, registra un altro video.",
    }
    now = datetime.now(UTC)

    result = event_out(
        BehaviorEventRec(
            id="event-legacy",
            capture_id="capture-legacy",
            dog_id="dog-1",
            user_id="user-1",
            status="COMPLETED",
            primary_intent=IntentCode.ALERT_VIGILANCE,
            confidence_band=ConfidenceBand.MEDIUM,
            summary=interpretation.consumer_summary,
            interpretation_json=payload,
            advice_json={
                "code": "ADVICE_MONITOR_BASELINE_CHANGE",
                "category": "MONITOR",
                "action": "Se ricapita, registra un altro video.",
                "rationale": "Confronta più episodi.",
                "follow_up": "Osserva se ricapita.",
                "source_ids": ["S13"],
                "risk": "LOW",
            },
            created_at=now,
            completed_at=now,
        )
    )

    assert result.consumer_headline == "Oreo è in allerta e sta segnalando qualcosa"
    assert "ti sta avvisando" in (result.summary or "")
    assert "tre abbai" not in (result.summary or "")
    assert result.advice is not None
    assert result.advice.code == "ADVICE_REWARD_BASED_REDIRECT"
    assert "Controlla con calma" in result.advice.action
