from __future__ import annotations

import uuid

import pytest

from app.api.routes.realtime import _is_owned_active_voice_session, _welcome_text
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
    deterministic_safety_interrupt,
    openai_realtime_decision_schema,
    orchestrate_realtime_turn,
)
from app.providers.openai_realtime import realtime_session_config
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


def test_voice_session_accepts_database_uuid_owner() -> None:
    user_id = str(uuid.uuid4())
    assert _is_owned_active_voice_session(
        {"user_id": uuid.UUID(user_id), "status": "ACTIVE", "modality": "VOICE"},
        user_id,
    )


def test_welcome_is_personal_and_never_technical() -> None:
    welcome = _welcome_text("attilio", "Oreo")
    assert welcome == (
        "Ciao Attilio, sono qui per te e Oreo. Cosa vuoi capire oggi?"
    )
    assert "modello" not in welcome


def test_welcome_offers_to_resume_the_last_conversation() -> None:
    welcome = resume_welcome_text("attilio", "Oreo", "perché Oreo abbaia la sera")
    assert welcome == (
        "Ciao Attilio, l'ultima volta parlavamo di perché Oreo abbaia la sera. "
        "Vuoi riprendere la vecchia chiacchierata o parliamo di altro?"
    )
    assert conversation_topic(["ciao", "perché Oreo abbaia la sera"], dog_name="Oreo") == (
        "perché Oreo abbaia la sera"
    )


def test_voice_session_speaks_without_waiting_for_tools() -> None:
    config = realtime_session_config(Settings(), instructions="ciao")
    assert "tools" not in config
    assert "tool_choice" not in config
    vad = config["audio"]["input"]["turn_detection"]
    assert vad["type"] == "server_vad"
    assert vad["create_response"] is True
    assert vad["interrupt_response"] is True
    assert vad["silence_duration_ms"] == 600
    assert vad["threshold"] == 0.65
    assert config["audio"]["output"]["voice"] == "coral"
    assert config["audio"]["output"]["speed"] == 1.0
    assert config["max_output_tokens"] == 180


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
    assert "1-2 frasi" in brief
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
        "Ciao, sono qui per te e Oreo. Cosa vuoi capire oggi?"
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
    assert again.status_code == 201
    assert "Vuoi riprendere la vecchia chiacchierata" in again.json()["welcome_text"]
    assert "Come sta Oreo oggi?" in again.json()["welcome_text"]
