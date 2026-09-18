"""Raccontami flow saves only explicitly confirmed owner-reported facts."""

import base64

import pytest

from app.api.routes import owner_stories
from app.config import Settings
from app.contracts.errors import ApiError, ErrorCode
from app.domains.owner_stories import extract_owner_reported_facts
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
    assert draft["transcript"] is None
    score = state.store.knowledge_scores[-1]
    assert score["version"] == "behavior-knowledge/v2"
    assert "owner_stories" not in score["components"]

    listed = await client.get(
        f"/v1/dogs/{dog_id}/owner-stories",
        headers=auth_headers,
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["facts"] == edited

    edited[0]["statement"] = "Rocky preferisce uscire piano al mattino."
    updated = await client.patch(
        f"/v1/dogs/{dog_id}/owner-stories/{body['draft_id']}",
        headers=auth_headers,
        json={"facts": edited},
    )
    assert updated.status_code == 200
    assert updated.json()["facts"] == edited

    deleted = await client.delete(
        f"/v1/dogs/{dog_id}/owner-stories/{body['draft_id']}",
        headers=auth_headers,
    )
    assert deleted.status_code == 204
    assert "owner_stories" not in state.store.knowledge_scores[-1]["components"]
    listed_after_delete = await client.get(
        f"/v1/dogs/{dog_id}/owner-stories",
        headers=auth_headers,
    )
    assert listed_after_delete.json()["items"] == []


async def test_owner_story_draft_can_be_discarded(client, auth_headers, state):
    dog_id = await create_dog(client, auth_headers)
    prepared = await client.post(
        f"/v1/dogs/{dog_id}/owner-stories/prepare",
        headers=auth_headers,
        json={"text": "Rocky preferisce passeggiare al mattino."},
    )
    draft_id = prepared.json()["draft_id"]

    discarded = await client.delete(
        f"/v1/dogs/{dog_id}/owner-stories/{draft_id}",
        headers=auth_headers,
    )

    assert discarded.status_code == 204
    assert draft_id not in state.store.owner_reported_observations


async def test_owner_audio_checks_ownership_before_transcription(
    client, auth_headers, monkeypatch
):
    called = False

    async def fake_transcribe(*_args, **_kwargs):
        nonlocal called
        called = True
        return "Non deve essere chiamato"

    monkeypatch.setattr(owner_stories, "transcribe_owner_audio", fake_transcribe)
    response = await client.post(
        "/v1/dogs/00000000-0000-0000-0000-000000000099/owner-stories/prepare-audio",
        headers=auth_headers,
        json={
            "audio_base64": base64.b64encode(b"audio bytes").decode(),
            "content_type": "audio/webm",
        },
    )

    assert response.status_code == 404
    assert called is False


async def test_owner_audio_is_idempotent(client, auth_headers, monkeypatch):
    dog_id = await create_dog(client, auth_headers)
    calls = 0

    async def fake_transcribe(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return "Rocky ama passeggiare al mattino."

    monkeypatch.setattr(owner_stories, "transcribe_owner_audio", fake_transcribe)
    payload = {
        "audio_base64": base64.b64encode(b"same audio bytes").decode(),
        "content_type": "audio/webm",
    }
    headers = {**auth_headers, "X-Idempotency-Key": "owner-audio-same-0001"}

    first = await client.post(
        f"/v1/dogs/{dog_id}/owner-stories/prepare-audio",
        headers=headers,
        json=payload,
    )
    second = await client.post(
        f"/v1/dogs/{dog_id}/owner-stories/prepare-audio",
        headers=headers,
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()
    assert calls == 1


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


def test_owner_story_extracts_newlines_and_italian_health_terms():
    facts = extract_owner_reported_facts(
        "Rocky ha vomitato questa mattina\nDi solito dorme dopo pranzo"
    )

    assert [fact.category for fact in facts] == ["HEALTH", "ROUTINE"]
    assert len(facts) == 2


def test_owner_story_discards_greetings_and_generic_questions():
    assert (
        extract_owner_reported_facts(
            "Ciao, tutto bene, come sta andando la situazione?"
        )
        == []
    )
    facts = extract_owner_reported_facts(
        "Ciao. Sembra stanco. Come sta andando la situazione?"
    )
    assert [fact.statement for fact in facts] == ["Sembra stanco."]


async def test_legacy_conversation_is_not_returned_as_a_memory(
    client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    user_id = state.store.dogs[dog_id].owner_id
    state.store.owner_reported_observations["useful"] = {
        "id": "useful",
        "dog_id": dog_id,
        "user_id": user_id,
        "status": "CONFIRMED",
        "confirmed_at": "2026-09-17T19:27:36Z",
        "facts": [
            {
                "id": "fact-useful",
                "category": "GENERAL",
                "statement": "Sembra stanco",
                "provenance": "OWNER_REPORTED",
            }
        ],
    }
    state.store.owner_reported_observations["conversation"] = {
        "id": "conversation",
        "dog_id": dog_id,
        "user_id": user_id,
        "status": "CONFIRMED",
        "confirmed_at": "2026-09-08T22:28:24Z",
        "facts": [
            {
                "id": "fact-conversation",
                "category": "GENERAL",
                "statement": "Ciao, tutto bene, come sta andando la situazione?",
                "provenance": "OWNER_REPORTED",
            }
        ],
    }

    response = await client.get(
        f"/v1/dogs/{dog_id}/owner-stories",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == ["useful"]
