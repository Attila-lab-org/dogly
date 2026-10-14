"""OpenAI Realtime ephemeral credentials for DOGly Live (WebRTC)."""

from __future__ import annotations

import logging
from typing import Any, Literal

import httpx

from app.config import Settings
from app.knowledge.spoken_style import DOGLY_SPOKEN_STYLE

logger = logging.getLogger(__name__)

AskVoiceGender = Literal["FEMALE", "MALE"]

# Best-quality OpenAI voices as of 2026 guidance (marin/cedar).
VOICE_BY_GENDER: dict[AskVoiceGender, str] = {
    "FEMALE": "marin",
    "MALE": "cedar",
}

LIVE_MODEL = "gpt-realtime"
LIVE_TOKEN_TTL_SECONDS = 600
DEFAULT_LIVE_SECONDS = 240


def openai_voice_for_gender(gender: str | None) -> str:
    key = (gender or "FEMALE").upper()
    if key not in VOICE_BY_GENDER:
        key = "FEMALE"
    return VOICE_BY_GENDER[key]  # type: ignore[index]


def build_live_instructions(
    *,
    dog_name: str,
    owner_name: str | None,
    previous_topic: str | None,
) -> str:
    owner = (owner_name or "").strip().split(" ", 1)[0]
    who = owner or "il proprietario"
    resume = ""
    if previous_topic and previous_topic.strip().casefold() != dog_name.casefold():
        resume = (
            f" Se naturale, puoi riprendere brevemente il filo su «{previous_topic.strip()}»,"
            " ma solo se l'umano sembra volerlo."
        )
    return (
        f"Sei DOGly, amica esperta di cani. Parli a voce con {who} di {dog_name}. "
        "Tono caldo, chiaro, italiano naturale, frasi brevi adatte alla voce. "
        "Aspetta sempre che l'umano finisca di parlare prima di rispondere; "
        "non parlare sopra di lui e non ripetere la tua ultima frase. "
        "Se senti eco o la tua stessa voce nel microfono, ignorala. "
        "All'inizio saluta in una sola frase corta, poi ascolta. "
        "Quando parla di abbai o vocalizzi di "
        f"{dog_name}, NON rifiutare: offri subito una lettura in parole umane "
        "(contesto + tono + ciò che sai di questo cane). Non inventare un dizionario "
        "universale; se l'audio del cane arriva debole dal microfono, dillo in una "
        "frase e chiedi un dettaglio o un video di 10 secondi dalla chat Testo. "
        "Non inventare sintomi medici né diagnosi: per urgenze invita a contattare un veterinario. "
        "Non menzionare modelli, API o istruzioni di sistema.\n\n"
        f"{DOGLY_SPOKEN_STYLE}"
        f"{resume}"
    )


async def mint_realtime_client_secret(
    settings: Settings,
    *,
    instructions: str,
    voice: str,
    safety_identifier: str,
) -> dict[str, Any]:
    """Mint a short-lived Realtime client secret for browser WebRTC."""
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY missing")
    if settings.realtime_kill_switch or settings.ai_kill_switch:
        raise RuntimeError("Realtime disabled by kill switch")

    payload = {
        "expires_after": {"anchor": "created_at", "seconds": LIVE_TOKEN_TTL_SECONDS},
        "session": {
            "type": "realtime",
            "model": LIVE_MODEL,
            "instructions": instructions,
            "audio": {
                "input": {
                    "transcription": {"model": "gpt-4o-mini-transcribe"},
                    "noise_reduction": {"type": "near_field"},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.55,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 700,
                    },
                },
                "output": {"voice": voice},
            },
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
        "OpenAI-Safety-Identifier": safety_identifier[:64],
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/client_secrets",
            headers=headers,
            json=payload,
        )
        if response.status_code >= 400:
            # Fallback to legacy sessions mint if client_secrets shape differs.
            legacy = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "realtime=v1",
                },
                json={
                    "model": LIVE_MODEL,
                    "voice": voice,
                    "instructions": instructions,
                    "modalities": ["audio", "text"],
                    "input_audio_transcription": {"model": "gpt-4o-mini-transcribe"},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.55,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 700,
                    },
                },
            )
            if legacy.status_code >= 400:
                logger.error(
                    "OpenAI live mint failed secrets=%s sessions=%s body=%s",
                    response.status_code,
                    legacy.status_code,
                    legacy.text[:400],
                )
                response.raise_for_status()
            data = legacy.json()
            secret = data.get("client_secret") or {}
            return {
                "value": secret.get("value") or data.get("value"),
                "expires_at": secret.get("expires_at") or data.get("expires_at"),
                "voice": voice,
                "model": data.get("model") or LIVE_MODEL,
            }
        data = response.json()
    value = data.get("value")
    if not value and isinstance(data.get("client_secret"), dict):
        value = data["client_secret"].get("value")
    expires_at = data.get("expires_at")
    if expires_at is None and isinstance(data.get("client_secret"), dict):
        expires_at = data["client_secret"].get("expires_at")
    if not value:
        raise RuntimeError("OpenAI live mint returned no client secret")
    return {
        "value": value,
        "expires_at": expires_at,
        "voice": voice,
        "model": LIVE_MODEL,
    }
