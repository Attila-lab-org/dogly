from __future__ import annotations

import uuid

import pytest

from app.api.routes.realtime import (
    _is_owned_active_voice_session,
    _resume_history,
    _welcome_text,
)
from app.config import Settings
from app.contracts.realtime import RealtimeDecision
from app.domains.realtime_context import (
    RealtimeContextItem,
    RealtimeDogContext,
    companion_science_brief,
    conversation_topic,
    render_voice_brief,
    resume_welcome_text,
    route_realtime_domains,
)
from app.domains.realtime_orchestrator import (
    _apply_conversation_policy,
    _provider_decision,
    deterministic_safety_interrupt,
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


def test_openai_schema_requires_every_nullable_field() -> None:
    schema = openai_realtime_decision_schema()
    assert set(schema["required"]) == set(schema["properties"])
    assert schema["additionalProperties"] is False
    assert "default" not in str(schema)


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


def test_provider_decision_keeps_backend_owned_continuation_prompts() -> None:
    decision = _provider_decision(
        '{"assistant_text":"È un momento tenero, fatto di coccole.","domains":["BEHAVIOR"],'
        '"suggested_prompts":["Come capisco quando vuole ancora coccole?",'
        '"Lui vuole sempre questo"],"question_information_gain":"NONE"}',
        domains=["BEHAVIOR"],
    )

    assert decision is not None
    assert decision.suggested_prompts == ["Come capisco quando vuole ancora coccole?"]


def test_generic_suggested_prompts_are_removed_instead_of_shown_as_a_menu() -> None:
    decision = _provider_decision(
        '{"assistant_text":"Oggi Oreo ha dormito quasi sempre.","domains":["BEHAVIOR"],'
        '"suggested_prompts":["Come posso conoscerlo meglio?",'
        '"Cosa osservo quando dorme così?"],"question_information_gain":"NONE"}',
        domains=["BEHAVIOR"],
    )

    assert decision is not None
    assert decision.suggested_prompts == ["Cosa osservo quando dorme così?"]


def test_repeated_affection_answer_is_replaced_by_a_warm_next_step() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    decision = _apply_conversation_policy(
        RealtimeDecision(
            assistant_text=(
                "Oreo resta vicino a te e si rilassa con le coccole. "
                "Continua con qualche pausa e osserva se torna da te."
            )
        ),
        context=context,
        user_text="Oreo è la mia vita",
        history=[
            {
                "role": "assistant",
                "content": (
                    "Oreo resta vicino a te e si rilassa con le coccole. "
                    "Continua con qualche pausa e osserva se torna da te."
                ),
            }
        ],
        domains=["GENERAL"],
    )

    assert "famiglia" in decision.assistant_text
    assert decision.media_invite == "PHOTO"
    assert decision.media_prompt == "Fammi vedere quanto è bello Oreo"
    assert decision.question is None
    assert decision.suggested_prompts == []


def test_natural_affection_answer_is_not_replaced_by_a_fixed_phrase() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    original = "Si vede che tra voi c'è qualcosa di speciale, e questo momento parla da solo."
    decision = _apply_conversation_policy(
        RealtimeDecision(assistant_text=original),
        context=context,
        user_text="Oreo è la mia vita",
        history=[],
        domains=["GENERAL"],
    )

    assert decision.assistant_text == original
    assert decision.media_invite == "PHOTO"


def test_answer_to_previous_question_does_not_trigger_another_question() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    decision = _apply_conversation_policy(
        RealtimeDecision(
            assistant_text="Perfetto, questo mi aiuta a capire la distanza.",
            question="Quando succede, abbaia subito?",
            question_options=["Sì", "No"],
            question_information_gain="CHANGES_ACTION",
            suggested_prompts=["Cosa guardo dopo?"],
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

    assert decision.question is None
    assert decision.question_options == []
    assert decision.suggested_prompts == []


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
            response_mode="CONVERSATION",
        ),
        context=context,
        user_text="Oreo è la mia vita, ma oggi perde pelo e si gratta.",
        history=[],
        domains=["CARE"],
    )

    assert decision.response_mode == "CONVERSATION"
    assert decision.media_invite is None


def test_recent_photo_invite_is_not_repeated() -> None:
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})
    decision = _apply_conversation_policy(
        RealtimeDecision(
            assistant_text="Che bello sentirti parlare così di lui.",
            response_mode="CONVERSATION",
        ),
        context=context,
        user_text="È davvero tutto per me.",
        history=[
            {"role": "assistant", "content": "Se vuoi, fammi vedere Oreo in una foto."}
        ],
        domains=["GENERAL"],
    )

    assert decision.response_mode == "AFFECTION"
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


def test_welcome_offers_to_resume_the_last_conversation() -> None:
    welcome = resume_welcome_text("attilio", "Oreo", "perché Oreo abbaia la sera")
    assert welcome == (
        "Ciao Attilio. Ho ancora presente l'ultima cosa che stavamo guardando: “perché Oreo abbaia la sera”. "
        "Vuoi riprenderla oppure mi racconti com'è Oreo oggi?"
    )
    assert "Luna" in resume_welcome_text("attilio", "Luna", "perché abbaia la sera")


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


def test_voice_brief_is_personal_and_ready_to_speak() -> None:
    welcome = _welcome_text("attilio", "Oreo")
    brief = render_voice_brief(
        RealtimeDogContext(
            dog_id="dog-1",
            dog_name="Oreo",
            owner_display_name="Attilio",
            identity={"breed_label": "Meticcio", "age_stage": "ADULT"},
            items=[
                RealtimeContextItem(
                    source_id="fecal-1",
                    source_type="DIGESTIVE_EVENT",
                    summary="La digestione è stabile e oggi non serve cambiare alimentazione.",
                    data={"headline": "Oreo sta digerendo bene"},
                ),
                RealtimeContextItem(
                    source_id="food-1",
                    source_type="FOOD_PRODUCT",
                    summary="Cibo da confermare: Royal Canin Adult",
                ),
            ],
        ),
        welcome=welcome,
    )
    assert "Oreo" in brief
    assert "Attilio" in brief
    assert "amico intelligente" in brief
    assert "La lunghezza è adattiva" in brief
    assert "75 parole" not in brief
    assert "Non ripetere quel saluto" in brief
    assert "Oreo sta digerendo bene" in brief
    assert "Scodinzolare" in brief
    assert "Alimentazione:" in brief
    assert "Royal Canin Adult" in brief
    assert "3-6 frasi" not in brief
    assert "voce calma" not in brief
    assert "Distingui esplicitamente" not in brief
    assert "modello" not in brief.lower()
    assert "database" not in brief.lower()


def test_companion_science_lets_realtime_talk_about_dogs_in_general() -> None:
    lines = companion_science_brief()
    joined = "\n".join(lines)
    assert any("Scodinzolare" in line for line in lines)
    assert "abbaio" in joined.lower()
    assert "veterinario" in joined.lower()


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
async def test_disabled_realtime_makes_legacy_headline_direct() -> None:
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
    assert decision.assistant_text == "Oreo è tranquillo e rilassato"
    assert "sembra" not in decision.assistant_text.lower()


@pytest.mark.asyncio
async def test_disabled_realtime_prioritizes_relationship_affection() -> None:
    settings = Settings(realtime_enabled=False)
    context = RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={})

    decision, _ = await orchestrate_realtime_turn(
        settings=settings,
        user_text="Oreo è la mia vita",
        domains=["GENERAL"],
        context=context,
        history=[],
    )

    assert "famiglia" in decision.assistant_text
    assert decision.media_invite == "PHOTO"
    assert decision.suggested_prompts == []


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
            "memory_candidate": "Oreo ama dormire sul divano.",
            "memory_category": "PREFERENCE",
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


def test_voice_and_orchestrated_turns_share_spoken_delivery_and_memory_boundaries():
    from app.domains.realtime_orchestrator import _SYSTEM
    from app.knowledge.spoken_style import DOGLY_SPOKEN_STYLE

    brief = render_voice_brief(
        RealtimeDogContext(dog_id="dog-1", dog_name="Oreo", identity={}),
        welcome="Ciao, sono qui.",
    )
    assert DOGLY_SPOKEN_STYLE in _SYSTEM
    assert DOGLY_SPOKEN_STYLE in brief
    assert "fingere mai di vedere o sentire" in brief
    assert "isolato non è un'abitudine" in brief
    assert "Il significato che il proprietario sta vivendo" in _SYSTEM
    assert "Non trasformare un gesto affettuoso in agitazione" in _SYSTEM
