"""Short voice dictation for Ask / Home composer (native + web fallback)."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends

from app.api.deps import StateDep, UserIdDep, rate_limit
from app.contracts.api import VoiceTranscribeOut, VoiceTranscribeRequest
from app.contracts.taxonomy import AnalysisDomain
from app.domains.repository import new_id
from app.providers.base import ProviderUsage
from app.providers.openai_transcription import transcribe_owner_audio

router = APIRouter()


@router.post("/voice/transcribe", response_model=VoiceTranscribeOut)
async def transcribe_voice(
    payload: VoiceTranscribeRequest,
    state: StateDep,
    user_id: UserIdDep,
    _limiter: None = Depends(rate_limit("voice.transcribe", limit=12)),
) -> VoiceTranscribeOut:
    started = time.perf_counter()
    text = await transcribe_owner_audio(
        state.settings,
        audio_base64=payload.audio_base64,
        content_type=payload.content_type,
    )
    await state.cost_meter.record(
        usage=ProviderUsage(
            provider="openai",
            model=state.settings.owner_transcription_model,
            media_bytes=(len(payload.audio_base64) * 3) // 4,
            latency_ms=int((time.perf_counter() - started) * 1_000),
            cost_usd=round(
                state.settings.owner_transcription_usd_per_minute
                * state.settings.ai_cost_safety_margin,
                6,
            ),
        ),
        operation="owner_story.transcribe",
        domain=AnalysisDomain.OWNER_STORY,
        event_id=new_id(),
        user_id=user_id,
    )
    return VoiceTranscribeOut(text=text)
