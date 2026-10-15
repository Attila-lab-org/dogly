"""OpenAI GPT-Live WebRTC sessions for DOGly Live."""

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

LIVE_MODEL = "gpt-live-1"
# Server session lifetime. The client timer is only a UX aid; backend session
# expiry also prevents later turns from being accepted after this window.
DEFAULT_LIVE_SECONDS = 15 * 60
_MAX_DOSSIER_CHARS = 2800
_MAX_SDP_CHARS = 65_536


def _normalize_sdp_offer(sdp_offer: str) -> str:
    """Preserve a WHIP-friendly SDP blob for OpenAI GPT-Live WebRTC.

    Do not ``.strip()`` the whole string: SDP parsers expect CRLF-terminated
    lines including the final line, and stripping causes ``unmarshal SDP: EOF``.
    """
    raw = sdp_offer or ""
    if not raw.strip():
        return ""
    # Normalize to \r\n line endings without dropping the final terminator.
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    if not text.endswith("\n"):
        text += "\n"
    text = text.replace("\n", "\r\n")
    if not text.lstrip().startswith("v="):
        return ""
    return text


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
        f"Sei DOGly, amica esperta di cani che vuole bene a {dog_name}. "
        f"Parli a voce con {who}. Conversazione libera e naturale: niente script "
        "né questionari. Tono caldo, chiaro, italiano. Frasi adatte alla voce. "
        "Puoi ascoltare mentre parli (full duplex): se l'umano ti interrompe, "
        "cedi subito e rispondi a ciò che dice. "
        "Aspetta che l'umano finisca; non parlare sopra di lui; non ripetere la tua ultima frase. "
        "Se senti eco o la tua stessa voce, ignorala. "
        "All'inizio un saluto cortissimo, poi ascolta.\n"
        "Memoria: usala solo quando cambia la lettura. Esempio: se ci sono digestioni "
        "brutte recenti e ora guaisce, puoi dire che potrebbe avere mal di pancia e "
        "chiedere come sta — non forzare collegamenti deboli.\n"
        "Solo sugli abbai/vocalizzi (sempre in ascolto, nessun bottone): qui sei "
        f"traduttrice realista di {dog_name}. Priorità al CARATTERE ACUSTICO, senza "
        "edulcorare. Suono basso/duro/grave/tagliente/erotto/da allarme → tensione, "
        "difesa, rabbia o allerta — vietato «vuole attenzioni», «ti cerca», «vuole "
        "giocare» su un suono rabbioso. Suono acuto/morbido da contatto → richiesta "
        "o frustrazione da distanza. In dubbio: la lettura più intensa dal suono, "
        "poi UNA domanda sul corpo (orecchie, coda, rigidità). Traduci QUESTO momento, "
        "non un dizionario universale. Sul resto della conversazione resta l'amica "
        "esperta che vuole bene al cane.\n"
        "Non inventare fatti sul cane fuori dal dossier. "
        "Niente diagnosi mediche inventate; per urgenze invita un veterinario. "
        "Non menzionare modelli, API o istruzioni di sistema."
        f"{dossier_block}"
        f"{DOGLY_SPOKEN_STYLE}"
        f"{resume}"
    )


async def create_live_webrtc_session(
    settings: Settings,
    *,
    instructions: str,
    voice: str,
    sdp_offer: str,
    safety_identifier: str,
) -> dict[str, Any]:
    """Create a GPT-Live WebRTC session; returns SDP answer + OpenAI session id."""
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY missing")
    if settings.realtime_kill_switch or settings.ai_kill_switch:
        raise RuntimeError("Live disabled by kill switch")

    # Never str()strip() the whole SDP: parsers (Go/pion) need trailing CRLF
    # and return "unmarshal SDP: EOF" when the final line terminator is gone.
    offer = _normalize_sdp_offer(sdp_offer)
    if not offer or len(offer) > _MAX_SDP_CHARS:
        raise ValueError("Invalid SDP offer")

    logger.info(
        "GPT-Live WebRTC offer ready bytes=%s lines=%s starts_v=%s",
        len(offer),
        offer.count("\n") + 1,
        offer.startswith("v="),
    )

    # Client delegation (default): dog dossier lives in Live instructions.
    # WebRTC negotiates audio format via SDP — omit audio.format.
    payload: dict[str, Any] = {
        "session": {
            "model": LIVE_MODEL,
            "instructions": instructions,
            "audio": {
                "output": {"voice": voice},
            },
        },
        "transport": {
            "type": "webrtc",
            "sdp": offer,
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safety_identifier[:64],
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/live/sessions",
            headers=headers,
            json=payload,
        )
        if response.status_code >= 400:
            logger.error(
                "OpenAI GPT-Live session failed status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
            response.raise_for_status()
        data = response.json()

    session = data.get("session") if isinstance(data.get("session"), dict) else {}
    transport = data.get("transport") if isinstance(data.get("transport"), dict) else {}
    answer = transport.get("sdp")
    openai_session_id = session.get("id") or data.get("id")
    if not isinstance(answer, str) or not answer.strip():
        raise RuntimeError("OpenAI GPT-Live returned no SDP answer")
    return {
        "sdp": answer,
        "openai_session_id": str(openai_session_id) if openai_session_id else None,
        "voice": voice,
        "model": LIVE_MODEL,
    }

