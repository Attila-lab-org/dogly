"""Raccontami flow saves only explicitly confirmed owner-reported facts."""

import base64

import pytest

from app.config import Settings
from app.contracts.errors import ApiError, ErrorCode
from app.providers import openai_transcription
from tests.conftest import create_dog


async def test_owner_story_requires_review_before_confirmation(
    client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    prepared = await client.post(
        f"/v1/dogs/{dog_id}/owner-stories/prepare",
        headers=auth_headers,
        json={
            "text": (
                "Rocky ama le passeggiate lente. "
                "Da ieri mangia un nuovo snack."
            )
        },
    )
    body = prepared.json()

    assert prepared.status_code == 200
    assert len(body["facts"]) == 2
    assert {fact["provenance"] for fact in body["facts"]} == {
        "OWNER_REPORTED"
    }
    draft = state.store.owner_reported_observations[body["draft_id"]]
    assert draft["status"] == "DRAFT"

    edited = body["facts"][:1]
    edited[0]["statement"] = "Rocky ama le passeggiate lente al mattino."
    confirmed = await client.post(
        f"/v1/dogs/{dog_id}/owner-stories/{body['draft_id']}/confirm",
        headers=auth_headers,
        json={"facts": edited},
    )

    assert confirmed.status_code == 200
    assert confirmed.json()["facts"] == edited
    assert draft["status"] == "CONFIRMED"
    assert draft["facts"] == edited


class _TranscriptionResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {"text": "Rocky ama passeggiare al mattino."}


class _TranscriptionClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, _url, **kwargs):
        assert kwargs["data"]["language"] == "it"
        assert kwargs["files"]["file"][2] == "audio/webm"
        return _TranscriptionResponse()


async def test_owner_audio_is_transcribed_without_persisting_raw_bytes(monkeypatch):
    monkeypatch.setattr(
        openai_transcription.httpx,
        "AsyncClient",
        lambda **_kwargs: _TranscriptionClient(),
    )
    transcript = await openai_transcription.transcribe_owner_audio(
        Settings(openai_api_key="test-key"),
        audio_base64=base64.b64encode(b"short webm bytes").decode(),
        content_type="audio/webm",
    )

    assert transcript == "Rocky ama passeggiare al mattino."


async def test_owner_audio_rejects_invalid_base64():
    with pytest.raises(ApiError) as exc:
        await openai_transcription.transcribe_owner_audio(
            Settings(openai_api_key="test-key"),
            audio_base64="not-valid-base64!",
            content_type="audio/webm",
        )

    assert exc.value.code is ErrorCode.VALIDATION_FAILED
