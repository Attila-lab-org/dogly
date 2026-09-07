"""OpenAI digestive image observer contract tests (no paid API calls)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.config import Settings
from app.contracts.digestive import FecalConsistency
from app.providers import openai_digestive_vision


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://api.openai.com")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(
                "OpenAI error", request=request, response=response
            )


class _FakeClient:
    def __init__(self, responses: list[_FakeResponse], captured: list[dict]):
        self._responses = responses
        self._captured = captured

    async def post(self, _url: str, **kwargs):
        self._captured.append(kwargs["json"])
        return self._responses.pop(0)


def _payload(content: dict) -> dict:
    return {
        "choices": [{"message": {"content": json.dumps(content)}}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 50},
    }


def _observation() -> dict:
    return {
        "schema_version": "stool_observation.v0",
        "image_quality": "sufficient",
        "warnings": [],
        "fecal_score_estimate": 4,
        "consistency": "soft",
        "shape": "partially_formed",
        "color": "brown",
        "color_uncertainty": "low",
        "mucus_candidate": "none_observed",
        "fresh_blood_candidate": "none_observed",
        "melena_candidate": "none_observed",
        "foreign_material_candidate": "unknown",
        "confidence_band": "MEDIUM",
    }


@pytest.mark.asyncio
async def test_openai_digestive_observer_sends_signed_image_and_validates(
    monkeypatch,
):
    captured: list[dict] = []
    fake = _FakeClient([_FakeResponse(200, _payload(_observation()))], captured)
    monkeypatch.setattr(
        openai_digestive_vision.httpx,
        "AsyncClient",
        lambda *args, **kwargs: fake,
    )
    observer = openai_digestive_vision.OpenAIDigestiveVision(
        Settings(
            app_env="local",
            digestive_vision_provider="openai",
            digestive_vision_model="gpt-5-mini",
            openai_api_key="test-key",
        )
    )

    contract, usage = await observer.observe_stool(
        image_ref="https://storage.example.test/stool.jpg?token=signed"
    )

    image_part = captured[0]["messages"][1]["content"][1]
    assert image_part["image_url"]["url"].endswith("?token=signed")
    assert contract.consistency is FecalConsistency.SOFT
    assert contract.meta.provider == "openai"
    assert usage.provider == "openai"


@pytest.mark.asyncio
async def test_openai_digestive_observer_retries_rate_limits(monkeypatch):
    fake = _FakeClient([_FakeResponse(429, {})], [])
    monkeypatch.setattr(
        openai_digestive_vision.httpx,
        "AsyncClient",
        lambda *args, **kwargs: fake,
    )
    observer = openai_digestive_vision.OpenAIDigestiveVision(
        Settings(
            app_env="local",
            digestive_vision_provider="openai",
            digestive_vision_model="gpt-5-mini",
            openai_api_key="test-key",
        )
    )

    with pytest.raises(TimeoutError):
        await observer.observe_stool(
            image_ref="https://storage.example.test/stool.jpg"
        )
