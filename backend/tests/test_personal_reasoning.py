from __future__ import annotations

import json

import pytest
from app.config import Settings
from app.providers import personal_reasoning


@pytest.mark.asyncio
async def test_attachment_recognition_returns_evidence_and_domains(monkeypatch) -> None:
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "id": "chatcmpl-test",
                "choices": [{"message": {"content": json.dumps({
                    "description": "La foto mostra una superficie con feci scure; il cane non è inquadrato.",
                    "domains": ["DIGESTIVE"],
                })}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 20},
            }

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            return Response()

    monkeypatch.setattr(personal_reasoning.httpx, "AsyncClient", lambda **kwargs: Client())
    result, usage = await personal_reasoning.recognize_attachment(
        Settings(openai_api_key="test-key", realtime_reasoning_model="gpt-5.2"),
        image_url="https://storage.example/stool.jpg",
        user_text="Ti mostro questo momento",
    )

    assert result["domains"] == ["DIGESTIVE"]
    assert "feci scure" in result["description"]
    assert usage.request_id == "chatcmpl-test"
