"""Short-lived OpenAI Realtime credentials for authenticated DOGly sessions."""

from __future__ import annotations

import hashlib
from typing import Any

import httpx

from app.config import Settings

_VOICE_INSTRUCTIONS = """Sei la voce di DOGly. Non rispondere direttamente alle
domande sul cane e non inventare memoria. Prima dello strumento mantieni SILENZIO
ASSOLUTO: niente "un attimo", conferme, riempitivi o spiegazioni. Per ogni turno
completo del proprietario chiama subito e una sola volta lo strumento dogly_turn
con la trascrizione italiana.
Il server restituisce la risposta governata dal Personal Dog Model. Dopo il risultato
dello strumento, pronuncia fedelmente assistant_text con tono caldo, competente e
naturale; non aggiungere diagnosi, fatti, domande o consigli. Se è presente question,
pronunciala subito dopo assistant_text. Non leggere campi tecnici o codici."""


def realtime_session_config(settings: Settings) -> dict[str, Any]:
    return {
        "type": "realtime",
        "model": settings.realtime_voice_model,
        "output_modalities": ["audio"],
        "instructions": _VOICE_INSTRUCTIONS,
        "audio": {
            "input": {
                "noise_reduction": {"type": "near_field"},
                "transcription": {
                    "model": settings.owner_transcription_model,
                    "language": "it",
                },
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": "medium",
                    "create_response": True,
                    "interrupt_response": True,
                },
            },
            "output": {"voice": settings.realtime_voice, "speed": 1.0},
        },
        "reasoning": {"effort": "low"},
        "tools": [
            {
                "type": "function",
                "name": "dogly_turn",
                "description": (
                    "Invia ogni richiesta del proprietario al Personal Dog Model "
                    "governato prima di formulare una risposta."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user_text": {
                            "type": "string",
                            "description": "Trascrizione fedele del turno del proprietario.",
                        }
                    },
                    "required": ["user_text"],
                    "additionalProperties": False,
                },
            }
        ],
        "tool_choice": {"type": "function", "name": "dogly_turn"},
        "max_output_tokens": 220,
        "tracing": {
            "workflow_name": "DOGly Realtime",
            "metadata": {"orchestrator": "realtime-orchestrator/v1"},
        },
    }


async def create_realtime_client_secret(
    settings: Settings, *, user_id: str
) -> dict[str, Any]:
    config = realtime_session_config(settings)
    safety_identifier = hashlib.sha256(
        f"dogly:{user_id}".encode()
    ).hexdigest()
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/client_secrets",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
                "OpenAI-Safety-Identifier": safety_identifier,
            },
            json={
                "expires_after": {"anchor": "created_at", "seconds": 120},
                "session": config,
            },
        )
        response.raise_for_status()
        return response.json()
