"""Pipeline di osservazione: enum chiusi, normalizzazione difensiva,
copertura a punteggio e safety flag deterministiche (sez. 15/16.3/19.3)."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.contracts.interpretation import (
    EvidenceItem,
    InterpretationContract,
    PersonalMemoryUsed,
    SafetyFlag,
)
from app.contracts.observation import (
    ApproachWithdrawalFreeze,
    BodyHeight,
    EarPosition,
    Locomotion,
    ObservationContract,
    Posture,
    TailHeight,
    TailMovement,
    VocalizationType,
    normalize_observation_dict,
)
from app.contracts.taxonomy import (
    ConfidenceBand,
    ContextBucket,
    IntentCode,
)
from app.domains.models import DogRec
from app.knowledge.advice import build_advice
from app.knowledge.models import (
    DogContextSnapshot,
    KnowledgeContext,
    LifeStageContext,
    LifestyleFact,
)
from app.knowledge.retrieval import retrieve_evidence
from app.knowledge.safety import (
    SAFE_ESCALATION_001,
    deterministic_safety_flags,
    fired_safety_ids,
    merge_safety_flags,
)
from app.providers.base import EligiblePatternSummary, ProviderUsage
from app.providers.mock import load_fixture


def _dog(**overrides) -> DogRec:
    return DogRec(
        id="dog-1",
        owner_id="user-1",
        name="Luna",
        created_at=datetime.now(UTC),
        **overrides,
    )


def _context() -> DogContextSnapshot:
    return DogContextSnapshot(
        dog_id="dog-1",
        life_stage=LifeStageContext(
            value="MATURE_ADULT", source="DERIVED", confidence="MEDIUM"
        ),
    )


def _obs(**body_overrides) -> ObservationContract:
    raw = {
        "observer_meta": {
            "provider": "mock",
            "model": "mock",
            "request_id": "req-test",
        },
        "capture_quality": {
            "overall_quality": "good",
            "dog_visible_fraction": 1.0,
        },
        "body": dict(body_overrides),
    }
    return ObservationContract.model_validate(raw)


# ---------------------------------------------------------------------------
# Task 1 — enum chiusi
# ---------------------------------------------------------------------------


def test_enum_fields_accept_canonical_values():
    obs = ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "mock",
                "model": "mock",
                "request_id": "req-enum",
            },
            "body": {
                "body_height": "lowered",
                "posture": "play_bow",
                "locomotion": "walking",
                "approach_withdrawal_freeze": "withdrawal",
                "rigidity_candidate": "yes",
            },
            "ears": {"position": "flat_back"},
            "tail": {
                "neutral_relative_height": "tucked",
                "movement": "stiff_sweep",
            },
            "vocalization": {"type_candidates": ["bark", "growl", "whimper"]},
        }
    )
    assert obs.body.body_height is BodyHeight.LOWERED
    assert obs.body.posture is Posture.PLAY_BOW
    assert obs.body.locomotion is Locomotion.WALKING
    assert obs.body.approach_withdrawal_freeze is ApproachWithdrawalFreeze.WITHDRAWAL
    assert obs.ears.position is EarPosition.FLAT_BACK
    assert obs.tail.neutral_relative_height is TailHeight.TUCKED
    assert obs.tail.movement is TailMovement.STIFF_SWEEP
    assert obs.vocalization.type_candidates == [
        VocalizationType.BARK,
        VocalizationType.GROWL,
        VocalizationType.WHIMPER,
    ]


def test_enum_fields_default_to_unknown():
    obs = _obs()
    assert obs.body.body_height is BodyHeight.UNKNOWN
    assert obs.body.posture is Posture.UNKNOWN
    assert obs.body.locomotion is Locomotion.UNKNOWN
    assert obs.body.approach_withdrawal_freeze is ApproachWithdrawalFreeze.UNKNOWN
    assert obs.ears.position is EarPosition.UNKNOWN
    assert obs.tail.neutral_relative_height is TailHeight.UNKNOWN
    assert obs.tail.movement is TailMovement.UNKNOWN
    assert obs.vocalization.type_candidates == []


@pytest.mark.parametrize(
    "section",
    [
        {"body_height": "floating"},
        {"posture": "dabbing"},
        {"locomotion": "teleporting"},
        {"approach_withdrawal_freeze": "moonwalk"},
    ],
)
def test_invalid_enum_values_fail_validation_loudly(section):
    with pytest.raises(ValidationError):
        _obs(**section)


def test_invalid_ear_tail_vocalization_values_fail_validation_loudly():
    base = {
        "observer_meta": {"provider": "mock", "model": "mock", "request_id": "req-x"},
    }
    with pytest.raises(ValidationError):
        ObservationContract.model_validate({**base, "ears": {"position": "spinning"}})
    with pytest.raises(ValidationError):
        ObservationContract.model_validate(
            {**base, "tail": {"movement": "helicopter"}}
        )
    with pytest.raises(ValidationError):
        ObservationContract.model_validate(
            {**base, "vocalization": {"type_candidates": ["meow"]}}
        )


# ---------------------------------------------------------------------------
# Task 2 — normalizzazione difensiva degli alias
# ---------------------------------------------------------------------------


def test_normalization_maps_aliases_to_canonical_values():
    raw = {
        "body": {
            "body_height": "Crouched",
            "approach_withdrawal_freeze": "  Retreating ",
            "posture": "play-bow",
            "locomotion": "stationary",
        },
        "ears": {"position": "Pinned Back"},
        "tail": {
            "movement": "wag",
            "neutral_relative_height": "Between-Legs",
        },
        "vocalization": {"type_candidates": ["snarl", "YELP", "bark"]},
    }
    normalized = normalize_observation_dict(raw)
    assert normalized["body"]["body_height"] == "lowered"
    assert normalized["body"]["approach_withdrawal_freeze"] == "withdrawal"
    assert normalized["body"]["posture"] == "play_bow"
    assert normalized["body"]["locomotion"] == "still"
    assert normalized["ears"]["position"] == "flat_back"
    assert normalized["tail"]["movement"] == "wagging"
    assert normalized["tail"]["neutral_relative_height"] == "tucked"
    assert normalized["vocalization"]["type_candidates"] == [
        "growl",
        "whimper",
        "bark",
    ]
    assert normalized["vocalization"]["present"] == "yes"


def test_normalization_garbage_becomes_unknown():
    raw = {
        "body": {"body_height": "teleporting"},
        "tail": {"movement": 42},
        "vocalization": {"type_candidates": ["meow", "bark"]},
    }
    normalized = normalize_observation_dict(raw)
    assert normalized["body"]["body_height"] == "unknown"
    assert normalized["tail"]["movement"] == "unknown"
    assert normalized["vocalization"]["type_candidates"] == ["unknown", "bark"]
    assert normalized["vocalization"]["present"] == "yes"


def test_normalization_does_not_mutate_input_and_validates():
    raw = {
        "observer_meta": {"provider": "mock", "model": "mock", "request_id": "req-n"},
        "body": {"body_height": "wag"},
        "tail": {"movement": "wag"},
    }
    snapshot = json.loads(json.dumps(raw))
    obs = ObservationContract.model_validate(normalize_observation_dict(raw))
    assert obs.tail.movement is TailMovement.WAGGING
    assert obs.body.body_height is BodyHeight.UNKNOWN
    assert raw == snapshot


def test_alias_normalization_roundtrip_through_contract():
    raw = normalize_observation_dict(
        {
            "observer_meta": {"provider": "mock", "model": "mock", "request_id": "req-r"},
            "body": {"approach_withdrawal_freeze": "backing away"},
            "vocalization": {"type_candidates": ["snarl"]},
        }
    )
    obs = ObservationContract.model_validate(raw)
    assert obs.body.approach_withdrawal_freeze is ApproachWithdrawalFreeze.WITHDRAWAL
    assert obs.vocalization.type_candidates == [VocalizationType.GROWL]


def test_normalization_accepts_gemini_creative_payload():
    """Payload reale da produzione: alias di qualità, chiavi extra, bool."""
    raw = {
        "capture_quality": {
            "framing": "medium",
            "lighting": "dim",
            "motion_blur": "low",
            "audio_quality": "clear",
            "overall_quality": "adequate",
        },
        "scene": {
            "environment": "indoor",
            "human_present": True,
            "dogs_present_count": 0,
            "human_interaction": "none",
        },
        "body": {"rigidity_candidate": False},
        "head_face": {
            "gaze_direction": "towards_human",
            "mouth": "closed",
        },
        "timeline": [
            {
                "start_ms": 0,
                "end_ms": 2000,
                "description": "Dog steps toward seated person.",
            }
        ],
        "invented_top_level": "drop-me",
    }
    obs = ObservationContract.model_validate(
        {
            **normalize_observation_dict(raw),
            "observer_meta": {
                "provider": "gemini",
                "model": "test",
                "request_id": "req-prod",
            },
        }
    )
    assert obs.capture_quality.framing.value == "degraded"
    assert obs.capture_quality.lighting.value == "degraded"
    assert obs.capture_quality.motion_blur.value == "degraded"
    assert obs.capture_quality.audio_quality == "good"
    assert obs.capture_quality.overall_quality.value == "degraded"
    assert obs.scene.environment_class == "indoor"
    assert obs.scene.human_count == 1
    assert obs.scene.dog_count == 0
    assert obs.body.rigidity_candidate.value == "no"
    assert obs.head_face.gaze_target == "towards_human"
    assert obs.head_face.mouth_state == "closed"
    assert obs.timeline[0].observed_changes == ["Dog steps toward seated person."]


# ---------------------------------------------------------------------------
# Task 2 — prompt Gemini con vocabolario chiuso
# ---------------------------------------------------------------------------


class _FakeGeminiResponse:
    status_code = 200

    def __init__(
        self,
        payload: dict,
        *,
        content: bytes = b"",
        headers: dict[str, str] | None = None,
    ):
        self._payload = payload
        self.content = content
        self.headers = headers or {}

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class _FakeGeminiClient:
    """Cattura il body della richiesta e risponde con JSON di observation."""

    def __init__(self, payload: dict, captured: list):
        self._payload = payload
        self.captured = captured

    async def get(self, url, params=None, headers=None):
        if url == "https://example.test/clip.webm":
            return _FakeGeminiResponse({}, content=b"real-video-bytes")
        return _FakeGeminiResponse(
            {
                "name": "files/dogly-test",
                "uri": "https://generativelanguage.googleapis.com/v1beta/files/dogly-test",
                "state": "ACTIVE",
            }
        )

    async def post(self, url, params=None, json=None, headers=None, content=None):
        if "/upload/v1beta/files" in url:
            return _FakeGeminiResponse(
                {},
                headers={"x-goog-upload-url": "https://upload.test/session"},
            )
        if url == "https://upload.test/session":
            return _FakeGeminiResponse(
                {
                    "file": {
                        "name": "files/dogly-test",
                        "uri": "https://generativelanguage.googleapis.com/v1beta/files/dogly-test",
                        "state": "ACTIVE",
                    }
                }
            )
        self.captured.append(json)
        return _FakeGeminiResponse(self._payload)

    async def delete(self, url, params=None, headers=None):
        return _FakeGeminiResponse({})


def _gemini_payload(observation_text: str) -> dict:
    return {
        "candidates": [{"content": {"parts": [{"text": observation_text}]}}],
        "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5},
    }


async def test_gemini_prompt_carries_closed_allowed_values(monkeypatch):
    from app.config import Settings
    from app.providers import gemini_observer

    captured: list[dict] = []
    # Il modello ignora il vocabolario e risponde con alias: la normalizzazione
    # difensiva deve comunque produrre un contratto valido.
    observation_text = json.dumps(
        {
            "body": {"approach_withdrawal_freeze": "Retreating"},
            "tail": {"movement": "wag"},
            "vocalization": {"type_candidates": ["snarl"]},
        }
    )
    fake_client = _FakeGeminiClient(_gemini_payload(observation_text), captured)
    monkeypatch.setattr(
        gemini_observer.httpx, "AsyncClient", lambda *a, **k: fake_client
    )
    settings = Settings(app_env="local", gemini_api_key="test-key")
    observer = gemini_observer.GeminiVideoObserver(settings)

    contract, _usage = await observer.observe(
        video_ref="https://example.test/clip.webm",
        content_type="video/webm",
        policy_version="policy-v1",
        duration_ms=8000,
    )

    assert len(captured) == 1
    assert (
        captured[0]["contents"][0]["parts"][0]["file_data"]["mime_type"]
        == "video/webm"
    )
    prompt_text = captured[0]["contents"][0]["parts"][1]["text"]
    system_text = captured[0]["system_instruction"]["parts"][0]["text"]
    # Il prompt espone il vocabolario chiuso dei valori ammessi.
    assert "CLOSED" in system_text
    assert '"wagging"' in prompt_text
    assert '"stiff_sweep"' in prompt_text
    assert '"withdrawal"' in prompt_text
    assert '"growl"' in prompt_text
    assert '"tucked"' in prompt_text
    # La risposta con alias è stata normalizzata prima della validazione.
    assert contract.body.approach_withdrawal_freeze is ApproachWithdrawalFreeze.WITHDRAWAL
    assert contract.tail.movement is TailMovement.WAGGING
    assert contract.vocalization.type_candidates == [VocalizationType.GROWL]


async def test_gemini_failed_file_is_deleted_before_returning(monkeypatch):
    from app.config import Settings
    from app.providers import gemini_observer

    deleted: list[str] = []

    class FailedFileClient(_FakeGeminiClient):
        async def post(self, url, params=None, json=None, headers=None, content=None):
            if url == "https://upload.test/session":
                return _FakeGeminiResponse(
                    {
                        "file": {
                            "name": "files/failed-video",
                            "uri": "https://generativelanguage.googleapis.com/v1beta/files/failed-video",
                            "state": "FAILED",
                        }
                    }
                )
            return await super().post(
                url,
                params=params,
                json=json,
                headers=headers,
                content=content,
            )

        async def delete(self, url, params=None, headers=None):
            deleted.append(url)
            return _FakeGeminiResponse({})

    fake_client = FailedFileClient({}, [])
    monkeypatch.setattr(
        gemini_observer.httpx, "AsyncClient", lambda *a, **k: fake_client
    )
    observer = gemini_observer.GeminiVideoObserver(
        Settings(app_env="local", gemini_api_key="test-key")
    )

    with pytest.raises(RuntimeError, match="rejected"):
        await observer._upload_video_file(
            video_ref="https://example.test/clip.webm",
            content_type="video/webm",
            request_id="gem-cleanup-test",
        )

    assert deleted == [
        "https://generativelanguage.googleapis.com/v1beta/files/failed-video"
    ]


async def test_gemini_observe_falls_back_to_inline_when_files_api_rejects(
    monkeypatch,
):
    from app.config import Settings
    from app.providers import gemini_observer

    captured: list[dict] = []
    observation_text = json.dumps(
        {
            "body": {"approach_withdrawal_freeze": "Retreating"},
            "tail": {"movement": "wag"},
        }
    )

    class RejectThenGenerateClient(_FakeGeminiClient):
        async def post(self, url, params=None, json=None, headers=None, content=None):
            if url == "https://upload.test/session":
                return _FakeGeminiResponse(
                    {
                        "file": {
                            "name": "files/failed-video",
                            "uri": "https://generativelanguage.googleapis.com/v1beta/files/failed-video",
                            "state": "FAILED",
                        }
                    }
                )
            return await super().post(
                url,
                params=params,
                json=json,
                headers=headers,
                content=content,
            )

    fake_client = RejectThenGenerateClient(_gemini_payload(observation_text), captured)
    monkeypatch.setattr(
        gemini_observer.httpx, "AsyncClient", lambda *a, **k: fake_client
    )
    observer = gemini_observer.GeminiVideoObserver(
        Settings(app_env="local", gemini_api_key="test-key")
    )
    contract, _usage = await observer.observe(
        video_ref="https://example.test/clip.webm",
        content_type="video/webm",
        policy_version="policy-v1",
        duration_ms=8000,
    )
    assert contract.tail.movement is TailMovement.WAGGING
    assert "inline_data" in captured[0]["contents"][0]["parts"][0]
    assert captured[0]["contents"][0]["parts"][0]["inline_data"]["mime_type"] == (
        "video/webm"
    )


# ---------------------------------------------------------------------------
# Task 3 — copertura a punteggio
# ---------------------------------------------------------------------------


def test_three_cards_same_family_are_not_high_coverage():
    # rigidity + crouch + play_bow = 3 card, ma tutte famiglia "body".
    obs = _obs(
        rigidity_candidate="yes",
        posture="crouch",
    )
    obs = ObservationContract.model_validate(
        {
            **obs.model_dump(mode="json"),
            "body": {
                "rigidity_candidate": "yes",
                "posture": "play_bow",
                "body_height": "lowered",
            },
        }
    )
    result = retrieve_evidence(obs, ContextBucket.UNKNOWN, _context())
    families = {card.card_id for card in result.cards}
    assert {"OBS_BODY_001", "OBS_BODY_002", "OBS_BODY_004"} <= families
    assert result.coverage == "MEDIUM"


def test_rich_observation_is_high_coverage_when_quality_good():
    raw = load_fixture("observation.fixture.json")
    obs = ObservationContract.model_validate(raw)
    result = retrieve_evidence(obs, ContextBucket.HOME, _context())
    assert result.coverage == "HIGH"


def test_bounded_retrieval_preserves_diverse_signal_families():
    obs = ObservationContract.model_validate(
        {
            **_obs().model_dump(mode="json"),
            "body": {
                "body_height": "lowered",
                "rigidity_candidate": "yes",
                "approach_withdrawal_freeze": "withdrawal",
            },
            "tail": {
                "neutral_relative_height": "tucked",
                "movement": "wagging",
            },
            "ears": {"position": "flat_back"},
            "vocalization": {"type_candidates": ["bark"]},
            "scene": {"human_count": 1},
        }
    )

    result = retrieve_evidence(obs, ContextBucket.HOME, _context())
    ids = {card.card_id for card in result.cards}

    assert len(result.cards) == 6
    assert SAFE_ESCALATION_001 not in ids
    assert "OBS_TAIL_001" in ids
    assert "OBS_EAR_001" in ids
    assert "AUD_BARK_001" in ids


def test_degraded_quality_caps_coverage_at_medium():
    raw = load_fixture("observation.fixture.json")
    raw["capture_quality"]["overall_quality"] = "degraded"
    obs = ObservationContract.model_validate(raw)
    result = retrieve_evidence(obs, ContextBucket.HOME, _context())
    card_ids = {card.card_id for card in result.cards}
    assert "ABSTAIN_001" in card_ids  # qualità != good -> card di astensione
    assert result.coverage == "MEDIUM"  # mai HIGH con qualità degradata


def test_abstain_card_never_raises_coverage():
    obs = _obs(rigidity_candidate="yes")
    obs = ObservationContract.model_validate(
        {
            **obs.model_dump(mode="json"),
            "capture_quality": {"overall_quality": "degraded"},
        }
    )
    result = retrieve_evidence(obs, ContextBucket.UNKNOWN, _context())
    card_ids = {card.card_id for card in result.cards}
    assert "ABSTAIN_001" in card_ids
    # 1 sola famiglia + ABSTAIN: la copertura resta LOW.
    assert result.coverage == "LOW"


def test_contradictions_lower_coverage():
    # Multi-famiglia che senza contraddizione farebbe HIGH.
    no_contradiction = _obs(rigidity_candidate="yes")
    no_contradiction = ObservationContract.model_validate(
        {
            **no_contradiction.model_dump(mode="json"),
            "tail": {"movement": "wagging", "neutral_relative_height": "above"},
            "vocalization": {"type_candidates": ["growl"]},
        }
    )
    high = retrieve_evidence(no_contradiction, ContextBucket.UNKNOWN, _context())
    assert high.coverage == "HIGH"

    with_contradiction = ObservationContract.model_validate(
        {
            **no_contradiction.model_dump(mode="json"),
            "tail": {"movement": "wagging", "neutral_relative_height": "tucked"},
        }
    )
    medium = retrieve_evidence(with_contradiction, ContextBucket.UNKNOWN, _context())
    # wagging + tucked = contraddizione rilevata: la banda scende.
    assert medium.coverage == "MEDIUM"


# ---------------------------------------------------------------------------
# Task 4 — safety flag deterministiche
# ---------------------------------------------------------------------------


def test_rigidity_plus_growl_fires_safe_escalation():
    obs = _obs(rigidity_candidate="yes")
    obs = ObservationContract.model_validate(
        {
            **obs.model_dump(mode="json"),
            "vocalization": {"type_candidates": ["growl"]},
        }
    )
    flags = deterministic_safety_flags(obs, _context())
    assert [(f.code, f.severity) for f in flags] == [(SAFE_ESCALATION_001, "urgent")]
    # La retrieval usa la STESSA regola: la card SAFE_* è in evidenza.
    result = retrieve_evidence(obs, ContextBucket.UNKNOWN, _context())
    assert result.cards[0].card_id == SAFE_ESCALATION_001


def test_two_distress_signals_fire_safe_distress():
    obs = ObservationContract.model_validate(
        {
            **(_obs()).model_dump(mode="json"),
            "body": {"body_height": "lowered"},
            "tail": {"neutral_relative_height": "tucked"},
        }
    )
    assert "SAFE_DISTRESS_001" in fired_safety_ids(obs, _context())
    flags = deterministic_safety_flags(obs, _context())
    assert flags[0].severity == "high"


def test_health_context_pain_fires_safe_pain():
    context = DogContextSnapshot(
        dog_id="dog-1",
        life_stage=LifeStageContext(
            value="MATURE_ADULT", source="DERIVED", confidence="MEDIUM"
        ),
        health_context=[
            LifestyleFact(key="reported_pain", value=True, provenance="VET_REPORTED")
        ],
    )
    obs = _obs()
    assert "SAFE_PAIN_001" in fired_safety_ids(obs, context)


def test_health_context_does_not_treat_false_as_pain():
    context = _context().model_copy(
        update={
            "health_context": [
            LifestyleFact(key="reported_pain", value=False, provenance="OWNER_REPORTED")
            ]
        }
    )
    assert "SAFE_PAIN_001" not in fired_safety_ids(_obs(), context)


def test_health_context_detects_pain_in_owner_report_value():
    context = _context().model_copy(
        update={
            "health_context": [
                LifestyleFact(
                    key="owner_health",
                    value="Sembra dolorante oggi",
                    provenance="OWNER_REPORTED",
                )
            ]
        }
    )
    assert "SAFE_PAIN_001" in fired_safety_ids(_obs(), context)


def test_merge_safety_flags_deterministic_wins_on_severity():
    llm_flags = [
        SafetyFlag(code=SAFE_ESCALATION_001, severity="info"),
        SafetyFlag(code="LLM_ONLY", severity="medium"),
    ]
    det_flags = [SafetyFlag(code=SAFE_ESCALATION_001, severity="urgent")]
    merged = merge_safety_flags(llm_flags, det_flags)
    by_code = {flag.code: flag for flag in merged}
    assert by_code[SAFE_ESCALATION_001].severity == "urgent"
    assert "LLM_ONLY" not in by_code


def test_personal_memory_is_rehydrated_from_eligible_server_state():
    from app.worker.handlers import _ground_personal_memory

    interpretation = _interpretation(IntentCode.HIGH_AROUSAL, []).model_copy(
        update={
            "personal_memory_used": [
                PersonalMemoryUsed(
                    pattern_id="eligible-1",
                    state="STRONG",
                    support_summary="invented by model",
                ),
                PersonalMemoryUsed(
                    pattern_id="not-in-prompt",
                    state="ESTABLISHED",
                    support_summary="invented pattern",
                ),
            ]
        }
    )
    grounded = _ground_personal_memory(
        interpretation,
        [
            EligiblePatternSummary(
                pattern_id="eligible-1",
                state="PRELIMINARY",
                title="Server pattern",
                support_summary="support=4 confirm=0",
            )
        ],
    )

    assert [item.pattern_id for item in grounded.personal_memory_used] == [
        "eligible-1"
    ]
    assert grounded.personal_memory_used[0].state == "PRELIMINARY"
    assert (
        grounded.personal_memory_used[0].support_summary
        == "support=4 confirm=0"
    )


def test_muted_capture_removes_model_generated_vocalizations():
    from app.worker.handlers import _enforce_capture_modalities

    obs = ObservationContract.model_validate(
        {
            **_obs().model_dump(mode="json"),
            "capture_quality": {
                "overall_quality": "good",
                "audio_quality": "good",
            },
            "vocalization": {
                "present": "yes",
                "type_candidates": ["growl"],
                "count": 1,
            },
        }
    )
    grounded = _enforce_capture_modalities(obs, has_audio=False)

    assert grounded.capture_quality.audio_quality == "absent"
    assert grounded.vocalization.present.value == "no"
    assert grounded.vocalization.type_candidates == []


def test_confidence_is_capped_by_quality_and_abstention():
    from app.worker.handlers import _calibrated_confidence

    degraded = ObservationContract.model_validate(
        {
            **_obs().model_dump(mode="json"),
            "capture_quality": {"overall_quality": "degraded"},
        }
    )
    high = _interpretation(IntentCode.PLAY_INTERACTION, []).model_copy(
        update={"confidence_band": ConfidenceBand.HIGH}
    )
    abstained = high.model_copy(update={"primary_intent": IntentCode.INSUFFICIENT})

    assert (
        _calibrated_confidence(high, degraded, "MEDIUM")
        is ConfidenceBand.MEDIUM
    )
    assert (
        _calibrated_confidence(abstained, _obs(), "HIGH")
        is ConfidenceBand.LOW
    )


def _interpretation(intent: IntentCode, flags: list[SafetyFlag]) -> InterpretationContract:
    return InterpretationContract(
        primary_intent=intent,
        confidence_band=ConfidenceBand.MEDIUM,
        consumer_headline="Una lettura prudente del momento",
        dog_voice="«Potrei star cercando di dirti qualcosa.»",
        consumer_summary="Sintesi prudente.",
        evidence=[
            EvidenceItem(source="observation", description=f"ev {i}") for i in range(3)
        ],
        safety_flags=flags,
    )


def test_urgent_gate_triggers_on_deterministic_flag_alone():
    context = _context()
    knowledge = KnowledgeContext(registry_version="2.0", coverage="HIGH")
    advice = build_advice(
        _interpretation(
            IntentCode.HIGH_AROUSAL,
            flags=[SafetyFlag(code=SAFE_ESCALATION_001, severity="urgent")],
        ),
        context,
        knowledge,
    )
    assert advice is None


async def test_worker_merges_deterministic_flags_and_urgent_gate(
    client,
    worker_client,
    auth_headers,
    state,
):
    # Observer stub: osservazione con rigidity + growl (SAFE_ESCALATION_001).
    async def fake_observe(*, video_ref, content_type, policy_version, duration_ms):
        del video_ref, content_type, policy_version, duration_ms
        obs = ObservationContract.model_validate(
            {
                **(_obs(rigidity_candidate="yes")).model_dump(mode="json"),
                "vocalization": {"type_candidates": ["growl"]},
            }
        )
        usage = ProviderUsage(provider="mock", model="mock", request_id="req-s")
        return obs, usage

    state.observer = type("StubObserver", (), {"observe": staticmethod(fake_observe)})()

    dog = await client.post("/v1/dogs", headers=auth_headers, json={"name": "Rocky"})
    dog_id = dog.json()["id"]
    init = await client.post(
        "/v1/behavior/captures/init",
        headers={**auth_headers, "X-Idempotency-Key": "safety-init"},
        json={
            "dog_id": dog_id,
            "client_request_id": "safety-crid",
            "duration_ms": 8_000,
            "bytes": 1_000,
            "content_type": "video/mp4",
            "context_bucket": "HOME",
        },
    )
    capture_id = init.json()["capture_id"]
    event_id = init.json()["event_id"]
    complete = await client.post(
        f"/v1/behavior/captures/{capture_id}/complete",
        headers={**auth_headers, "X-Idempotency-Key": "safety-complete"},
    )
    assert complete.status_code == 200

    processed = await worker_client.post(
        "/tasks/run",
        headers={"x-internal-token": "test-internal-token"},
        json={"task_type": "behavior_analysis", "event_id": event_id},
    )
    assert processed.json()["status"] == "COMPLETED"

    event = await client.get(f"/v1/behavior/events/{event_id}", headers=auth_headers)
    body = event.json()
    flags = {flag["code"]: flag["severity"] for flag in body["safety_flags"]}
    # Il mock reasoner non emette flag: il flag deterministico è presente lo stesso.
    assert flags.get(SAFE_ESCALATION_001) == "urgent"
    # Il gate urgente dell'Advice Engine ha bloccato il consiglio catalogo.
    assert body["advice"] is None
