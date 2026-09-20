"""Short-lived OpenAI Realtime credentials for authenticated DOGly sessions."""

from __future__ import annotations

import hashlib
from typing import Any

import httpx

from app.config import Settings


def realtime_session_config(settings: Settings, *, instructions: str) -> dict[str, Any]:
    return {
        "type": "realtime",
        "model": settings.realtime_voice_model,
        "output_modalities": ["audio"],
        "instructions": instructions,
        "audio": {
            "input": {
                "noise_reduction": {"type": "near_field"},
                "transcription": {
                    "model": settings.owner_transcription_model,
                    "language": "it",
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.65,
                    "prefix_padding_ms": 280,
                    "silence_duration_ms": 600,
                    "create_response": True,
                    # DOGly is half-duplex: the microphone is closed while it
                    # speaks, so a VAD blip must never cut a sentence short.
                    "interrupt_response": False,
                },
            },
            "output": {"voice": settings.realtime_voice, "speed": 1.0},
        },
        # Keep a generous ceiling so a valid Italian sentence cannot be cut by
        # the transport. The spoken-style instructions keep normal answers
        # short; this is a safety ceiling, not a target length.
        "max_output_tokens": 512,
        "tracing": {
            "workflow_name": "DOGly Realtime",
            "metadata": {"mode": "speech-to-speech"},
        },
    }


async def create_realtime_client_secret(
    settings: Settings, *, user_id: str, instructions: str
) -> dict[str, Any]:
    config = realtime_session_config(settings, instructions=instructions)
    safety_identifier = hashlib.sha256(f"dogly:{user_id}".encode()).hexdigest()
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/client_secrets",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
                "OpenAI-Safety-Identifier": safety_identifier,
            },
            json={
                "expires_after": {"anchor": "created_at", "seconds": 900},
                "session": config,
            },
        )
        response.raise_for_status()
        return response.json()
