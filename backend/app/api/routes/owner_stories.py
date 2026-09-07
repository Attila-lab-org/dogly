"""Two-step owner story flow: prepare facts, then explicitly confirm."""

import time

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import (
    OwnerStoryAudioPrepareRequest,
    OwnerStoryConfirmedOut,
    OwnerStoryConfirmRequest,
    OwnerStoryDraftOut,
    OwnerStoryPrepareRequest,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains import owner_stories_db
from app.domains.dogs import get_owned_dog
from app.domains.owner_stories import extract_owner_reported_facts
from app.domains.repository import new_id, now_utc
from app.providers.base import ProviderUsage
from app.providers.openai_transcription import transcribe_owner_audio

router = APIRouter()


@router.post(
    "/dogs/{dog_id}/owner-stories/prepare",
    response_model=OwnerStoryDraftOut,
)
async def prepare_owner_story(
    dog_id: str,
    payload: OwnerStoryPrepareRequest,
    state: StateDep,
    user_id: UserIdDep,
) -> OwnerStoryDraftOut:
    facts = extract_owner_reported_facts(payload.text)
    if state.engine is not None:
        draft_id = await owner_stories_db.create_draft(
            state.engine,
            user_id=user_id,
            dog_id=dog_id,
            transcript=payload.text,
            facts=facts,
        )
    else:
        get_owned_dog(state.store, user_id=user_id, dog_id=dog_id)
        draft_id = new_id()
        state.store.owner_reported_observations[draft_id] = {
            "id": draft_id,
            "dog_id": dog_id,
            "user_id": user_id,
            "transcript": payload.text,
            "facts": [fact.model_dump(mode="json") for fact in facts],
            "status": "DRAFT",
            "created_at": now_utc(),
        }
    return OwnerStoryDraftOut(
        draft_id=draft_id,
        dog_id=dog_id,
        transcript=payload.text,
        facts=facts,
    )


@router.post(
    "/dogs/{dog_id}/owner-stories/prepare-audio",
    response_model=OwnerStoryDraftOut,
)
async def prepare_owner_story_audio(
    dog_id: str,
    payload: OwnerStoryAudioPrepareRequest,
    state: StateDep,
    user_id: UserIdDep,
) -> OwnerStoryDraftOut:
    started = time.perf_counter()
    transcript = await transcribe_owner_audio(
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
            # The mobile recorder caps clips at one minute; use the one-minute
            # ceiling so the daily gate remains conservative.
            cost_usd=0.003,
        ),
        operation="owner_story.transcribe",
        domain=AnalysisDomain.OWNER_STORY,
        event_id=new_id(),
        user_id=user_id,
    )
    return await prepare_owner_story(
        dog_id,
        OwnerStoryPrepareRequest(text=transcript),
        state,
        user_id,
    )


@router.post(
    "/dogs/{dog_id}/owner-stories/{draft_id}/confirm",
    response_model=OwnerStoryConfirmedOut,
)
async def confirm_owner_story(
    dog_id: str,
    draft_id: str,
    payload: OwnerStoryConfirmRequest,
    state: StateDep,
    user_id: UserIdDep,
) -> OwnerStoryConfirmedOut:
    if state.engine is not None:
        await owner_stories_db.confirm_draft(
            state.engine,
            user_id=user_id,
            dog_id=dog_id,
            draft_id=draft_id,
            facts=payload.facts,
        )
    else:
        draft = state.store.owner_reported_observations.get(draft_id)
        if (
            not draft
            or draft["dog_id"] != dog_id
            or draft["user_id"] != user_id
            or draft["status"] != "DRAFT"
        ):
            raise ApiError(ErrorCode.NOT_FOUND, "Owner story draft not found")
        draft["facts"] = [
            fact.model_dump(mode="json") for fact in payload.facts
        ]
        draft["status"] = "CONFIRMED"
        draft["confirmed_at"] = now_utc()
    return OwnerStoryConfirmedOut(
        observation_id=draft_id,
        dog_id=dog_id,
        facts=payload.facts,
    )
