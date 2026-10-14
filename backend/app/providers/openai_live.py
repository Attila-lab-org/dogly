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
_MAX_DOSSIER_CHARS = 2800


def openai_voice_for_gender(gender: str | None) -> str:
    key = (gender or "FEMALE").upper()
    if key not in VOICE_BY_GENDER:
        key = "FEMALE"
    return VOICE_BY_GENDER[key]  # type: ignore[index]


def _fact_line(fact: dict[str, Any]) -> str | None:
    summary = str(
        fact.get("summary")
        or fact.get("statement")
        or fact.get("text")
        or fact.get("label")
        or ""
    ).strip()
    if not summary:
        return None
    domain = str(fact.get("domain") or "").strip()
    if domain:
        return f"- [{domain}] {summary[:180]}"
    return f"- {summary[:180]}"


def compact_live_dossier(context: Any | None) -> str:
    """Short personal memory block for Live — fuel, not a script."""
    if context is None:
        return ""
    lines: list[str] = []
    identity = getattr(context, "identity", None) or {}
    if isinstance(identity, dict) and identity:
        bits = []
        for key in ("breed_label", "age_stage", "sex", "size", "weight_kg"):
            value = identity.get(key)
            if value not in (None, "", []):
                bits.append(f"{key}={value}")
        if bits:
            lines.append("Identità: " + ", ".join(bits))

    for fact in list(getattr(context, "core_facts", None) or [])[:8]:
        if isinstance(fact, dict):
            line = _fact_line(fact)
            if line:
                lines.append(line)

    for fact in list(getattr(context, "stable_facts", None) or [])[:8]:
        if isinstance(fact, dict):
            line = _fact_line(fact)
            if line:
                lines.append(line)

    # Recent analyses / evidence — the “cacca brutta 3 giorni” layer.
    for item in list(getattr(context, "items", None) or [])[:6]:
        summary = str(getattr(item, "summary", "") or "").strip()
        if not summary:
            continue
        source = str(getattr(item, "source_type", "") or "").strip()
        prefix = f"[{source}] " if source else ""
        lines.append(f"- {prefix}{summary[:200]}")

    if not lines:
        return ""
    body = "\n".join(lines)
    if len(body) > _MAX_DOSSIER_CHARS:
        body = body[: _MAX_DOSSIER_CHARS - 1].rsplit("\n", 1)[0] + "\n…"
    return (
        "Dossier di questo cane (dati, non copione). Usalo quando aiuta a "
        "collegare segnali — es. digestione recente + guaiti → puoi ipotizzare "
        "malessere e chiedere conferma. Non citare ogni riga.\n"
        f"{body}"
    )


def build_live_instructions(
    *,
    dog_name: str,
    owner_name: str | None,
    previous_topic: str | None,
    dossier: str = "",
) -> str:
    owner = (owner_name or "").strip().split(" ", 1)[0]
    who = owner or "il proprietario"
    resume = ""
    if previous_topic and previous_topic.strip().casefold() != dog_name.casefold():
        resume = (
            f" Se naturale, puoi riprendere brevemente il filo su «{previous_topic.strip()}»,"
            " ma solo se l'umano sembra volerlo."
        )
    dossier_block = f"\n\n{dossier.strip()}\n" if dossier.strip() else "\n"
    return (
        f"Sei DOGly, amica esperta di cani. Parli a voce con {who} di {dog_name}. "
        "Conversazione libera e naturale: non seguire uno script, non fare questionari. "
        "Tono caldo, chiaro, italiano. Frasi adatte alla voce. "
        "Aspetta che l'umano finisca; non parlare sopra di lui; non ripetere la tua ultima frase. "
        "Se senti eco o la tua stessa voce, ignorala. "
        "All'inizio un saluto cortissimo, poi ascolta.\n"
        "Memoria: usala solo quando cambia la lettura. Esempio: se ci sono digestioni "
        "brutte recenti e ora guaisce, puoi dire che potrebbe avere mal di pancia e "
        "chiedere come sta — non forzare collegamenti deboli.\n"
        "Abbai / vocalizzi: quando serve (l'umano chiede, o il cane si sente e il tema "
        "è quello), proponi una lettura in parole umane ancorata a questo cane e al "
        "momento. Non rifiutare. Non inventare un dizionario universale. Non proporla "
        "a ogni frase se non c'entra.\n"
        "Non inventare fatti sul cane fuori dal dossier. "
        "Niente diagnosi mediche inventate; per urgenze invita un veterinario. "
        "Non menzionare modelli, API o istruzioni di sistema."
        f"{dossier_block}"
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
