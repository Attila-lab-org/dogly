from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.api.routes import realtime as realtime_route
from app.api.routes.realtime import (
    _is_owned_active_voice_session,
    _resume_history,
    _welcome_text,
)
from app.config import Settings
from app.contracts.realtime import RealtimeDecision
from app.domains import realtime_orchestrator as realtime_orchestrator_module
from app.domains.models import BehaviorEventRec, FecalEventRec
from app.domains.realtime_context import (
    RealtimeContextItem,
    RealtimeDogContext,
    conversation_topic,
    focus_behavior_event,
    focus_digestive_event,
    resume_welcome_text,
    route_realtime_domains,
)
from app.domains.realtime_orchestrator import (
    _apply_conversation_policy,
    _provider_decision,
    deterministic_safety_interrupt,
    explicit_memory_request,
    openai_realtime_decision_schema,
    orchestrate_realtime_turn,
)

from tests.conftest import create_dog


def test_cross_domain_router_is_bounded() -> None:
    assert route_realtime_domains(
        "Oreo ha diarrea e da quando ho cambiato cibo è anche agitato"
    ) == ["DIGESTIVE", "NUTRITION", "BEHAVIOR"]


def test_question_requires_real_information_gain() -> None:
    with pytest.raises(ValueError, match="change the decision"):
        RealtimeDecision(
            assistant_text="Posso aiutarti.",
            question="Mi racconti altro?",
        )


def test_openai_schema_is_small_and_server_owned_fields_are_absent() -> None:
    schema = openai_realtime_decision_schema()
    assert set(schema["required"]) == set(schema["properties"])
    assert schema["additionalProperties"] is False
    assert "suggested_prompts" not in schema["properties"]
    assert "response_mode" not in schema["properties"]
    assert "memory_candidate" not in schema["properties"]
    assert "SAFETY_INTERRUPT" not in schema["properties"]["terminal_state"]["enum"]


def test_memory_requires_explicit_owner_request_outside_gpt() -> None:
    assert explicit_memory_request("Oreo ama dormire sul divano") is None
    assert explicit_memory_request("Ricordati che Oreo ama dormire sul divano") == {
        "statement": "Oreo ama dormire sul divano",
        "category": "PREFERENCE",
    }


def test_provider_decision_keeps_contextual_media_invite() -> None:
    decision = _provider_decision(
        '{"assistant_text":"Capisco il momento.","domains":["BEHAVIOR"],'
        '"media_invite":"PHOTO","media_prompt":"Fammi vedere dove perde pelo",'
        '"question_information_gain":"NONE"}',
        domains=["BEHAVIOR"],
    )

    assert decision is not None
    assert decision.media_invite == "PHOTO"
    assert decision.media_prompt == "Fammi vedere dove perde pelo"


def test_provider_decision_does_not_reject_words_as_technical_copy() -> None:
    decision = _provider_decision(
        '{"assistant_text":"Ho controllato il contesto disponibile.",'
        '"question_information_gain":"NONE"}',
        domains=["GENERAL"],
    )
    assert decision is not None
    assert decision.assistant_text == "Ho controllato il contesto disponibile."


def test_backend_does_not_infer_an_answer_from_missing_question_mark() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    decision = _apply_conversation_policy(
        RealtimeDecision(
            assistant_text="Perfetto, questo mi aiuta a capire la distanza.",
            question="Quando succede, abbaia subito?",
            question_options=["Sì", "No"],
            question_information_gain="CHANGES_ACTION",
        ),
        context=context,
        user_text="Di solito tra 5 e 10 metri.",
        history=[
            {
                "role": "assistant",
                "content": "A che distanza di solito scatta per primo?",
            }
        ],
        domains=["BEHAVIOR"],
    )

    assert decision.question == "Quando succede, abbaia subito?"
    assert decision.question_options == ["Sì", "No"]


def test_safety_question_can_follow_an_answer_when_really_needed() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    decision = _apply_conversation_policy(
        RealtimeDecision(
            assistant_text="Per capire quanto è urgente mi serve un ultimo dato.",
            question="Ha ingerito qualcosa di potenzialmente tossico?",
            question_options=["Sì", "No", "Non lo so"],
            question_information_gain="CHANGES_SAFETY",
        ),
        context=context,
        user_text="È successo poco fa.",
        history=[
            {
                "role": "assistant",
                "content": "Da quanto tempo lo noti?",
            }
        ],
        domains=["CARE"],
    )

    assert decision.question is not None
    assert decision.question_options == ["Sì", "No", "Non lo so"]


def test_question_takes_priority_over_optional_media_cta() -> None:
    decision = RealtimeDecision(
        assistant_text="Mi serve un dato prima di consigliarti il passo giusto.",
        question="Ha ingerito qualcosa?",
        question_options=["Sì", "No", "Non lo so"],
        question_information_gain="CHANGES_SAFETY",
        media_invite="PHOTO",
        media_prompt="Fammi vedere cosa ha mangiato",
    )

    assert decision.media_invite is None
    assert decision.media_prompt is None


def test_affection_signal_does_not_override_a_concrete_concern() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    decision = _apply_conversation_policy(
        RealtimeDecision(
            assistant_text="Capisco quanto ci tieni a Oreo. Guardiamo il problema.",
        ),
        context=context,
        user_text="Oreo è la mia vita, ma oggi perde pelo e si gratta.",
        history=[],
        domains=["CARE"],
    )

    assert decision.media_invite is None


def test_voice_session_accepts_database_uuid_owner() -> None:
    user_id = str(uuid.uuid4())
    assert _is_owned_active_voice_session(
        {"user_id": uuid.UUID(user_id), "status": "ACTIVE", "modality": "VOICE"},
        user_id,
    )


def test_welcome_is_personal_and_never_technical() -> None:
    welcome = _welcome_text("attilio", "Oreo")
    assert welcome == "Ciao Attilio. Sono qui con te e Oreo. Raccontami cosa vuoi guardare oggi."
    assert "modello" not in welcome


def test_welcome_keeps_previous_conversation_internal() -> None:
    welcome = resume_welcome_text("attilio", "Oreo", "perché Oreo abbaia la sera")
    assert welcome == "Ciao Attilio. Sono qui con te e Oreo. Raccontami cosa vuoi guardare oggi."
    assert "Ho ancora presente" not in welcome


def test_conversation_topic_ignores_rotating_starter_questions() -> None:
    assert conversation_topic(
        ["Qual è il modo migliore per accompagnarlo?"], dog_name="Oreo"
    ) == "Oreo"
    assert conversation_topic(
        ["Ti racconto cos'è successo oggi", "Riprendiamo da lì"], dog_name="Oreo"
    ) == "Oreo"


def test_new_text_session_resumes_previous_conversation_turns() -> None:
    history = _resume_history(
        [
            {"role": "proprietario", "content": "Oreo abbaia quando resta solo."},
            {"role": "DOGly", "content": "Proviamo a capire cosa succede prima."},
        ],
        [{"role": "user", "content": "E oggi lo ha rifatto."}],
    )

    assert history == [
        {"role": "user", "content": "Oreo abbaia quando resta solo."},
        {"role": "assistant", "content": "Proviamo a capire cosa succede prima."},
        {"role": "user", "content": "E oggi lo ha rifatto."},
    ]
    assert conversation_topic(["ciao", "perché Oreo abbaia la sera"], dog_name="Oreo") == (
        "perché Oreo abbaia la sera"
    )


def test_generic_weather_is_not_misrouted_to_behavior() -> None:
    assert route_realtime_domains("Oggi fa caldo e sono stanco") == ["GENERAL"]


def test_explicit_behavior_event_is_prioritized_without_question_overlap() -> None:
    context = RealtimeDogContext(
        dog_id="dog-1",
        dog_name="Oreo",
        identity={},
        items=[
            RealtimeContextItem(
                source_id="digestive-1",
                source_type="DIGESTIVE_EVENT",
                summary="Feci regolari",
            )
        ],
    )
    selected_event = BehaviorEventRec(
        id="behavior-1",
        capture_id="capture-1",
        dog_id="dog-1",
        user_id="owner-1",
        status="COMPLETED",
        summary="Abbaio osservato durante la separazione",
        created_at=datetime(2026, 1, 3, tzinfo=UTC),
    )

    # The owner question is unrelated; explicit event selection still wins.
    focus_behavior_event(context, selected_event)

    assert context.items[0].source_id == "behavior-1"
    assert context.items[0].source_type == "BEHAVIOR_EVENT"
    assert context.source_refs()[0] == {
        "source_id": "behavior-1",
        "source_type": "BEHAVIOR_EVENT",
    }


def test_focus_deduplicates_recent_selected_behavior_and_digestive_events() -> None:
    context = RealtimeDogContext(
        dog_id="dog-1",
        dog_name="Oreo",
        identity={},
        items=[
            RealtimeContextItem(
                source_id="behavior-1",
                source_type="BEHAVIOR_EVENT",
                summary="Copia behavior recente",
            ),
            RealtimeContextItem(
                source_id="digestive-1",
                source_type="DIGESTIVE_EVENT",
                summary="Copia digestive recente",
            ),
        ],
    )
    behavior = BehaviorEventRec(
        id="behavior-1",
        capture_id="capture-1",
        dog_id="dog-1",
        user_id="owner-1",
        status="COMPLETED",
        summary="Behavior selezionato",
        created_at=datetime(2026, 1, 3, tzinfo=UTC),
    )
    digestive = FecalEventRec(
        id="digestive-1",
        dog_id="dog-1",
        user_id="owner-1",
        client_request_id="request-1",
        image_path="fecal/image.jpg",
        status="COMPLETED",
        summary="Digestive selezionato",
        created_at=datetime(2026, 1, 4, tzinfo=UTC),
    )

    focus_behavior_event(context, behavior)
    focus_digestive_event(context, digestive)

    assert [item.source_id for item in context.items].count("behavior-1") == 1
    assert [item.source_id for item in context.items].count("digestive-1") == 1
    assert context.items[0].source_id == "digestive-1"
    assert context.items[1].source_id == "behavior-1"


def test_conversation_policy_does_not_rewrite_affection_or_force_media() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    original = "Si vede che tra voi c'è qualcosa di speciale."
    decision = _apply_conversation_policy(
        RealtimeDecision(assistant_text=original),
        context=context, user_text="Oreo è la mia vita", history=[], domains=["GENERAL"]
    )
    assert decision.assistant_text == original
    assert decision.media_invite is None


def test_realtime_prompt_leaves_meaning_to_gpt() -> None:
    from app.domains.realtime_orchestrator import _SYSTEM
    assert "frase corrente ha priorità" in _SYSTEM
    assert "Non creare domande o menu" in _SYSTEM
    assert "suggested_prompts" not in _SYSTEM


def test_deterministic_safety_interrupt_precedes_ai() -> None:
    decision = deterministic_safety_interrupt("Oreo fa fatica a respirare")
    assert decision is not None
    assert decision.terminal_state == "SAFETY_INTERRUPT"
    assert decision.safety_flags == ["EMERGENCY_BREATHING"]
    assert decision.question is None


@pytest.mark.asyncio
async def test_disabled_realtime_uses_grounded_latest_analysis() -> None:
    settings = Settings(realtime_enabled=False)
    context = RealtimeDogContext(
        dog_id="dog-1",
        dog_name="Oreo",
        identity={},
        items=[
            RealtimeContextItem(
                source_id="fecal-1",
                source_type="DIGESTIVE_EVENT",
                summary="La digestione è stabile e oggi non serve cambiare alimentazione.",
            )
        ],
    )
    decision, audit = await orchestrate_realtime_turn(
        settings=settings,
        user_text="Come va la sua digestione?",
        domains=["DIGESTIVE"],
        context=context,
        history=[],
    )
    assert "non serve cambiare alimentazione" in decision.assistant_text
    assert decision.used_source_ids == ["fecal-1"]
    assert audit["provider"] == "deterministic"


@pytest.mark.asyncio
async def test_disabled_realtime_preserves_legacy_headline_uncertainty() -> None:
    settings = Settings(realtime_enabled=False)
    context = RealtimeDogContext(
        dog_id="dog-1",
        dog_name="Oreo",
        identity={},
        items=[
            RealtimeContextItem(
                source_id="behavior-1",
                source_type="BEHAVIOR_EVENT",
                summary="Oreo sembra rilassato: corpo disteso.",
                data={"headline": "Oreo sembra rilassato"},
            )
        ],
    )
    decision, _ = await orchestrate_realtime_turn(
        settings=settings,
        user_text="Come sta Oreo?",
        domains=["BEHAVIOR"],
        context=context,
        history=[],
    )
    assert decision.assistant_text == "Oreo sembra rilassato"


@pytest.mark.asyncio
async def test_disabled_realtime_does_not_use_affection_regex_cta() -> None:
    settings = Settings(realtime_enabled=False)
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})

    decision, _ = await orchestrate_realtime_turn(
        settings=settings,
        user_text="Oreo è la mia vita",
        domains=["GENERAL"],
        context=context,
        history=[],
    )

    assert "famiglia" not in decision.assistant_text
    assert decision.media_invite is None


@pytest.mark.asyncio
async def test_behavior_without_evidence_hands_off_to_video() -> None:
    settings = Settings(realtime_enabled=False)
    context = RealtimeDogContext(
        dog_id="dog-1",
        dog_name="Oreo",
        identity={},
    )
    decision, _ = await orchestrate_realtime_turn(
        settings=settings,
        user_text="Perché Oreo abbaia così?",
        domains=["BEHAVIOR"],
        context=context,
        history=[],
    )
    assert decision.behavior_handoff is True
    assert decision.terminal_state == "BEHAVIOR_VIDEO_HANDOFF"
    assert "video" in decision.assistant_text.lower()


@pytest.mark.asyncio
async def test_realtime_api_session_turn_and_close(
    client, auth_headers: dict[str, str]
) -> None:
    dog_id = await create_dog(client, auth_headers, name="Oreo")
    session_response = await client.post(
        "/v1/realtime/sessions",
        headers=auth_headers,
        json={"dog_id": dog_id, "modality": "TEXT"},
    )
    assert session_response.status_code == 201
    assert session_response.json()["welcome_text"] == (
        "Ciao. Sono qui con te e Oreo. Raccontami cosa vuoi guardare oggi."
    )
    session_id = session_response.json()["id"]

    turn_response = await client.post(
        f"/v1/realtime/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"text": "Perché Oreo abbaia così?"},
    )
    assert turn_response.status_code == 201
    body = turn_response.json()
    assert body["terminal_state"] == "BEHAVIOR_VIDEO_HANDOFF"
    assert body["behavior_handoff_href"].startswith("/behavior/capture")

    persist_response = await client.post(
        f"/v1/realtime/sessions/{session_id}/turns",
        headers=auth_headers,
        json={
            "text": "Come sta Oreo oggi?",
            "assistant_text": "Oreo sta bene da quello che ho già visto. Cosa vuoi capire adesso?",
        },
    )
    assert persist_response.status_code == 201
    assert persist_response.json()["assistant_text"].startswith("Oreo sta bene")

    close_response = await client.delete(
        f"/v1/realtime/sessions/{session_id}", headers=auth_headers
    )
    assert close_response.status_code == 204

    again = await client.post(
        "/v1/realtime/sessions",
        headers=auth_headers,
        json={"dog_id": dog_id, "modality": "VOICE"},
    )
    # Live voice is intentionally retired; the conversation endpoint is text-only.
    assert again.status_code == 422


@pytest.mark.asyncio
async def test_realtime_route_keeps_domains_as_provenance_only(
    client, auth_headers: dict[str, str], monkeypatch
) -> None:
    dog_id = await create_dog(client, auth_headers, name="Oreo")
    session_response = await client.post(
        "/v1/realtime/sessions",
        headers=auth_headers,
        json={"dog_id": dog_id, "modality": "TEXT"},
    )
    session_id = session_response.json()["id"]
    captured: dict[str, object] = {}

    def fake_load_context(store, *, dog_id, domains, user_text):
        captured["domains"] = domains
        return RealtimeDogContext(dog_id=dog_id, dog_name="Oreo", identity={})

    monkeypatch.setattr(realtime_route, "load_realtime_context_memory", fake_load_context)
    response = await client.post(
        f"/v1/realtime/sessions/{session_id}/turns",
        headers=auth_headers,
        json={"text": "Perché Oreo abbaia così?"},
    )

    assert response.status_code == 201
    assert captured["domains"] == ["GENERAL"]
    assert response.json()["domains"] == ["BEHAVIOR"]


@pytest.mark.asyncio
async def test_realtime_api_prioritizes_explicit_behavior_event(
    client, auth_headers: dict[str, str], state, user_id: str, monkeypatch
) -> None:
    dog_id = await create_dog(client, auth_headers, name="Oreo")
    selected_id = str(uuid.uuid4())
    for index in range(16):
        event_id = selected_id if index == 0 else str(uuid.uuid4())
        state.store.behavior_events[event_id] = BehaviorEventRec(
            id=event_id,
            capture_id=f"capture-{index}",
            dog_id=dog_id,
            user_id=user_id,
            status="COMPLETED",
            summary=f"Lettura behavior {index}",
            created_at=datetime(2026, 1, 1 + index, tzinfo=UTC),
        )

    captured_contexts: list[RealtimeDogContext] = []
    original_focus = realtime_route.focus_behavior_event

    def capture_focus(context, event):
        original_focus(context, event)
        captured_contexts.append(context)

    monkeypatch.setattr(realtime_route, "focus_behavior_event", capture_focus)
    session_response = await client.post(
        "/v1/realtime/sessions",
        headers=auth_headers,
        json={"dog_id": dog_id, "modality": "TEXT"},
    )
    session_id = session_response.json()["id"]

    response = await client.post(
        f"/v1/realtime/sessions/{session_id}/turns",
        headers=auth_headers,
        json={
            "text": "Qual è il colore del cielo?",
            "event_id": selected_id,
            "context_source": "behavior",
        },
    )

    assert response.status_code == 201
    assert len(captured_contexts) == 1
    assert len(captured_contexts[0].items) == 12
    assert captured_contexts[0].items[0].source_id == selected_id
    assert captured_contexts[0].items[0].source_type == "BEHAVIOR_EVENT"


@pytest.mark.asyncio
async def test_realtime_payload_does_not_expose_keyword_domains_to_gpt(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"assistant_text":"Capito.",'
                                '"question_information_gain":"NONE"}'
                            )
                        }
                    }
                ]
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, *, headers, json):
            captured["body"] = json
            return FakeResponse()

    monkeypatch.setattr(
        realtime_orchestrator_module.httpx,
        "AsyncClient",
        lambda **kwargs: FakeClient(),
    )
    await orchestrate_realtime_turn(
        settings=Settings(realtime_enabled=True, openai_api_key="test-key"),
        user_text="Perché Oreo abbaia così?",
        domains=["BEHAVIOR"],
        context=RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={}),
        history=[],
    )

    payload = captured["body"]["messages"][1]["content"]
    assert "source_domains" not in payload
    assert "routed_domains" not in payload


@pytest.mark.asyncio
async def test_realtime_turn_can_attach_owned_private_photo(
    client, auth_headers: dict[str, str]
) -> None:
    dog_id = await create_dog(client, auth_headers, name="Oreo")
    album = await client.post(
        f"/v1/dogs/{dog_id}/albums",
        json={"title": "Momenti", "default_visibility": "PRIVATE"},
        headers=auth_headers,
    )
    assert album.status_code == 201
    photo = await client.post(
        f"/v1/albums/{album.json()['id']}/photos/init",
        json={"content_type": "image/jpeg", "bytes": 1_024},
        headers=auth_headers,
    )
    assert photo.status_code == 201

    session = await client.post(
        "/v1/realtime/sessions",
        headers=auth_headers,
        json={"dog_id": dog_id, "modality": "TEXT"},
    )
    assert session.status_code == 201
    turn = await client.post(
        f"/v1/realtime/sessions/{session.json()['id']}/turns",
        headers=auth_headers,
        json={
            "text": "Ti mostro dove perde pelo.",
            "photo_id": photo.json()["photo"]["id"],
            "photo_context": "Fammi vedere dove perde pelo",
            "assistant_text": "Vedo il momento, guardiamolo insieme.",
        },
    )

    assert turn.status_code == 201, turn.text
    assert turn.json()["attachment"] == {
        "kind": "PHOTO",
        "photo_id": photo.json()["photo"]["id"],
        "purpose": "Fammi vedere dove perde pelo",
    }


@pytest.mark.asyncio
async def test_confirmed_chat_memory_is_visible_in_owner_stories(
    client, auth_headers: dict[str, str], state
) -> None:
    from app.api.routes.realtime import _record_turn_memory

    dog_id = await create_dog(client, auth_headers, name="Oreo")
    user_id = state.store.dogs[dog_id].owner_id
    session = {
        "id": "session-memory-test",
        "dog_id": dog_id,
        "user_id": user_id,
        "status": "ACTIVE",
    }
    _record_turn_memory(
        state.store,
        session=session,
        user_text="Oreo ama dormire sul divano.",
        decision={
            "assistant_text": "Lo tengo presente.",
        },
        memory_request={
            "statement": "Oreo ama dormire sul divano.",
            "category": "PREFERENCE",
        },
    )
    proposal_id = next(iter(state.store.realtime_memory_proposals))

    decision = await client.post(
        f"/v1/realtime/memory-proposals/{proposal_id}/decision",
        headers=auth_headers,
        json={"action": "CONFIRM"},
    )
    assert decision.status_code == 200

    stories = await client.get(
        f"/v1/dogs/{dog_id}/owner-stories", headers=auth_headers
    )
    assert stories.status_code == 200
    assert stories.json()["items"][0]["facts"][0]["statement"] == (
        "Oreo ama dormire sul divano."
    )
