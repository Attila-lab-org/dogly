"""Short-lived owner audio transcription through OpenAI."""

from __future__ import annotations

import base64
import binascii

import httpx

from app.config import Settings
from app.contracts.errors import ApiError, ErrorCode
from app.domains.db import get_engine
from app.providers.budget import BudgetExceededError, check_daily_budget

MAX_AUDIO_BYTES = 2_750_000


async def transcribe_owner_audio(
    settings: Settings, *, audio_base64: str, content_type: str
) -> str:
    if settings.ai_kill_switch or settings.owner_transcription_kill_switch:
        raise ApiError(
            ErrorCode.INVALID_STATE,
            "Voice transcription is temporarily unavailable.",
        )
    if not settings.openai_api_key:
        raise ApiError(
            ErrorCode.INVALID_STATE,
            "Voice transcription is not configured.",
        )
    try:
        audio = base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED, "Invalid audio payload."
        ) from exc
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED, "Audio is empty or too large."
        )
    try:
        await check_daily_budget(
            get_engine(settings),
            role="owner_transcription",
            budget_usd=settings.owner_transcription_budget_usd_per_day,
            operation="owner_story.transcribe",
        )
    except BudgetExceededError as exc:
        raise ApiError(
            ErrorCode.AI_BUDGET_EXCEEDED,
            "Voice transcription is temporarily unavailable.",
        ) from exc
    extension = {
        "audio/m4a": "m4a",
        "audio/mp4": "m4a",
        "audio/webm": "webm",
        "audio/wav": "wav",
        "audio/mpeg": "mp3",
    }[content_type]
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            data={"model": settings.owner_transcription_model, "language": "it"},
            files={"file": (f"owner-story.{extension}", audio, content_type)},
        )
    if response.status_code == 429 or response.status_code >= 500:
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT,
            "Voice transcription is temporarily unavailable.",
            retryable=True,
        )
    if response.status_code >= 400:
        raise ApiError(
            ErrorCode.PROVIDER_SCHEMA_INVALID,
            "Voice transcription could not be completed.",
        )
    response.raise_for_status()
    transcript = str(response.json().get("text") or "").strip()
    if len(transcript) < 3:
        raise ApiError(
            ErrorCode.PROVIDER_SCHEMA_INVALID,
            "Voice transcription did not contain enough speech.",
        )
    return transcript[:2_000]
