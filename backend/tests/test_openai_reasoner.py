import json

import pytest

from app.config import Settings
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ContextBucket
from app.knowledge.models import (
    DogContextSnapshot,
    KnowledgeContext,
    LifeStageContext,
)
from app.providers.openai_reasoner import (
    OpenAIReasoner,
    chat_completion_body,
    merge_openai_usage,
)


def test_gpt5_mini_omits_temperature():
    body = chat_completion_body(
        "gpt-5-mini",
        [{"role": "user", "content": "{}"}],
        temperature=0.2,
    )
    assert "temperature" not in body
    assert body["model"] == "gpt-5-mini"
    assert body["response_format"] == {"type": "json_object"}


def test_gpt52_uses_high_reasoning_and_omits_temperature():
    body = chat_completion_body(
        "gpt-5.2",
        [{"role": "user", "content": "{}"}],
        temperature=0.2,
    )
    assert body["model"] == "gpt-5.2"
    assert body["reasoning_effort"] == "high"
    assert "temperature" not in body


def test_gpt4_family_keeps_temperature():
    body = chat_completion_body(
        "gpt-4.1-mini",
        [{"role": "user", "content": "{}"}],
        temperature=0.2,
    )
    assert body["temperature"] == 0.2


def test_merge_openai_usage_adds_repair_tokens():
    first = {"usage": {"prompt_tokens": 120, "completion_tokens": 40}}
    repair = {"usage": {"prompt_tokens": 80, "completion_tokens": 25}}
    merged = merge_openai_usage(first, repair)
    assert merged == {"prompt_tokens": 200, "completion_tokens": 65}


def _valid_reasoner_output() -> dict:
    return {
        "primary_intent": "PLAY_INTERACTION",
        "confidence_band": "HIGH",
        "consumer_headline": "Oreo ti sta proponendo un gioco",
        "dog_voice": "«Giochiamo?»",
        "consumer_summary": "Il corpo è sciolto e si avvicina.",
        "evidence": [
            {
                "source": "observation",
                "description": "Postura sciolta",
                "ref": "body.posture",
            },
            {
                "source": "observation",
                "description": "Coda in movimento",
                "ref": "tail.movement",
            },
            {
                "source": "observation",
                "description": "Si avvicina",
                "ref": "body.approach_withdrawal_freeze",
            },
        ],
        "alternatives": [],
        "safety_flags": [],
        "personal_memory_used": [],
    }


def _chat_payload(content: dict, *, prompt: int, completion: int) -> dict:
    return {
        "choices": [{"message": {"content": json.dumps(content)}}],
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion},
    }


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.status_code = 200
        self.text = ""
        self._payload = payload

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _FakeClient:
    def __init__(self, payloads: list[dict]) -> None:
        self._payloads = list(payloads)

    async def post(self, *args, **kwargs):
        del args, kwargs
        return _FakeResponse(self._payloads.pop(0))


@pytest.mark.asyncio
async def test_reasoner_usage_includes_repair_call():
    reasoner = OpenAIReasoner(
        Settings(
            app_env="local",
            openai_api_key="test-key",
            reasoning_model="gpt-4.1-mini",
            reasoner_budget_usd_per_day=0,
        )
    )
    reasoner._client = _FakeClient(
        [
            _chat_payload({"primary_intent": "PLAY_INTERACTION"}, prompt=100, completion=20),
            _chat_payload(_valid_reasoner_output(), prompt=70, completion=30),
        ]
    )
    observation = ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "test",
                "model": "test",
                "request_id": "repair-usage",
            },
            "capture_quality": {"overall_quality": "good"},
            "body": {
                "posture": "loose",
                "approach_withdrawal_freeze": "approach",
            },
            "tail": {"visible": "yes", "movement": "wagging"},
        }
    )

    _contract, usage = await reasoner.interpret(
        observation=observation,
        context_bucket=ContextBucket.HOME,
        policy_version="test",
        eligible_memory=[],
        knowledge_context=KnowledgeContext(registry_version="test", coverage="LOW"),
        dog_context=DogContextSnapshot(
            dog_id="dog-1",
            name="Oreo",
            life_stage=LifeStageContext(
                value="MATURE_ADULT",
                source="PROFILE",
                confidence="HIGH",
            ),
        ),
        dog_name="Oreo",
    )

    assert usage.input_tokens == 170
    assert usage.output_tokens == 50
    assert usage.cost_usd > 0
