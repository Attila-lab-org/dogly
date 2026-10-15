from types import SimpleNamespace

from app.providers.openai_live import (
    LIVE_MODEL,
    build_live_instructions,
    compact_live_dossier,
    openai_voice_for_gender,
)


def test_voice_gender_maps_to_best_quality_voices() -> None:
    assert openai_voice_for_gender("FEMALE") == "marin"
    assert openai_voice_for_gender("MALE") == "cedar"
    assert openai_voice_for_gender(None) == "marin"
    assert openai_voice_for_gender("nope") == "marin"


def test_live_instructions_stay_free_and_memory_aware() -> None:
    text = build_live_instructions(
        dog_name="Oreo",
        owner_name="Attila Rossi",
        previous_topic="ansia al parco",
        dossier="Dossier di questo cane\n- [DIGESTIVE] feci molli negli ultimi giorni",
    )
    assert "Oreo" in text
    assert "Attila" in text
    assert "ansia al parco" in text
    assert "libera" in text.casefold() or "non seguire uno script" in text.casefold()
    assert "mal di pancia" in text.casefold() or "malessere" in text.casefold()
    assert "full duplex" in text.casefold() or "ascoltare mentre" in text.casefold()
    assert "feci molli" in text
    assert "gpt-" not in text.casefold()
    assert "openai" not in text.casefold()
    assert LIVE_MODEL == "gpt-live-1"


def test_create_live_webrtc_session_posts_gpt_live_payload(monkeypatch) -> None:
    import httpx
    from app.providers import openai_live as live

    captured: dict = {}

    class FakeResponse:
        status_code = 201
        text = "{}"

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "session": {"id": "live_test_1"},
                "transport": {"type": "webrtc", "sdp": "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n"},
            }

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

    settings = SimpleNamespace(
        openai_api_key="sk-test",
        realtime_kill_switch=False,
        ai_kill_switch=False,
    )

    async def _run():
        return await live.create_live_webrtc_session(
            settings,
            instructions="Sei DOGly.",
            voice="marin",
            sdp_offer="v=0\r\no=- offer 1 IN IP4 127.0.0.1\r\n",
            safety_identifier="user-123",
        )

    import asyncio

    result = asyncio.run(_run())
    assert result["sdp"].startswith("v=0")
    assert result["openai_session_id"] == "live_test_1"
    assert result["model"] == "gpt-live-1"
    assert captured["url"] == "https://api.openai.com/v1/live/sessions"
    assert captured["json"]["session"]["model"] == "gpt-live-1"
    assert captured["json"]["session"]["audio"]["output"]["voice"] == "marin"
    assert captured["json"]["transport"]["type"] == "webrtc"
    assert "offer" in captured["json"]["transport"]["sdp"]
    assert captured["headers"]["OpenAI-Safety-Identifier"] == "user-123"


def test_compact_live_dossier_keeps_recent_analyses() -> None:
    context = SimpleNamespace(
        identity={"breed_label": "Meticcio", "age_stage": "adult"},
        core_facts=[{"summary": "Mangia croccantini X", "domain": "NUTRITION"}],
        stable_facts=[],
        items=[
            SimpleNamespace(
                summary="Feci molli per alcuni giorni",
                source_type="DIGESTIVE_EVENT",
            )
        ],
    )
    dossier = compact_live_dossier(context)
    assert "Meticcio" in dossier
    assert "Feci molli" in dossier
    assert "non copione" in dossier.casefold() or "non citare" in dossier.casefold()
