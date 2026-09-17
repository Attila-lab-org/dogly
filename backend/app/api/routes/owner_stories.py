"""Two-step owner story flow: prepare facts, then explicitly confirm."""

import time

from fastapi import APIRouter, Depends, Response

from app.api.deps import IdempotencyDep, StateDep, UserIdDep, rate_limit
from app.contracts.api import (
    OwnerReportedFact,
    OwnerStoryAudioPrepareRequest,
    OwnerStoryConfirmedOut,
    OwnerStoryConfirmRequest,
    OwnerStoryDraftOut,
    OwnerStoryListOut,
    OwnerStoryObservationOut,
    OwnerStoryPrepareRequest,
    OwnerStoryUpdateRequest,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains import dogs_db, idempotency_db, owner_stories_db
from app.domains.dogs import get_owned_dog
from app.domains.owner_stories import (
    extract_owner_reported_facts,
    is_useful_owner_statement,
)
from app.domains.personal_engine import (
    recalculate_knowledge_score_db,
    recalculate_knowledge_score_memory,
)
from app.domains.repository import new_id, now_utc
from app.providers.base import ProviderUsage
from app.providers.openai_transcription import transcribe_owner_audio

router = APIRouter()


def _require_useful_facts(
    facts: list[OwnerReportedFact],
) -> list[OwnerReportedFact]:
    useful = [
        fact for fact in facts if is_useful_owner_statement(fact.statement)
    ]
    if not useful:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED,
            "The story does not contain a useful fact about the dog.",
        )
    return useful


@router.get(
    "/dogs/{dog_id}/owner-stories",
    response_model=OwnerStoryListOut,
)
async def list_owner_stories(
    dog_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> OwnerStoryListOut:
    if state.engine is not None:
        rows = await owner_stories_db.list_confirmed(
            state.engine, user_id=user_id, dog_id=dog_id
        )
    else:
        get_owned_dog(state.store, user_id=user_id, dog_id=dog_id)
        rows = sorted(
            (
                observation
                for observation in state.store.owner_reported_observations.values()
                if observation["dog_id"] == dog_id
                and observation["user_id"] == user_id
                and observation["status"] == "CONFIRMED"
            ),
            key=lambda observation: observation["confirmed_at"],
            reverse=True,
        )
        filtered_rows = []
        for observation in rows:
            facts = [
                fact
                for fact in observation["facts"]
                if is_useful_owner_statement(
                    str(fact.get("statement") or "")
                )
            ]
            if facts:
                filtered_rows.append(
                    {
                        "id": observation["id"],
                        "dog_id": observation["dog_id"],
                        "facts": facts,
                        "confirmed_at": observation["confirmed_at"],
                    }
                )
        rows = filtered_rows
    return OwnerStoryListOut(
        items=[OwnerStoryObservationOut.model_validate(row) for row in rows]
    )


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
    guard: IdempotencyDep,
    _limiter: None = Depends(rate_limit("owner_story.audio", limit=5)),
) -> OwnerStoryDraftOut:
    if cached := guard.lookup():
        return OwnerStoryDraftOut.model_validate(cached)
    if state.engine is not None:
        await dogs_db.get_owned_dog(
            state.engine, user_id=user_id, dog_id=dog_id
        )
    else:
        get_owned_dog(state.store, user_id=user_id, dog_id=dog_id)

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
            # Recorder caps clips at one minute; charge the ceiling plus the
            # same conservative margin used by token-priced providers.
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
    result = await prepare_owner_story(
        dog_id,
        OwnerStoryPrepareRequest(text=transcript),
        state,
        user_id,
    )
    body = result.model_dump(mode="json")
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )
    return result


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
    facts = _require_useful_facts(payload.facts)
    if state.engine is not None:
        await owner_stories_db.confirm_draft(
            state.engine,
            user_id=user_id,
            dog_id=dog_id,
            draft_id=draft_id,
            facts=facts,
        )
        await recalculate_knowledge_score_db(state.engine, dog_id=dog_id)
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
            fact.model_dump(mode="json") for fact in facts
        ]
        draft["transcript"] = None
        draft["status"] = "CONFIRMED"
        draft["confirmed_at"] = now_utc()
        recalculate_knowledge_score_memory(state.store, dog_id=dog_id)
    return OwnerStoryConfirmedOut(
        observation_id=draft_id,
        dog_id=dog_id,
        facts=facts,
    )


@router.patch(
    "/dogs/{dog_id}/owner-stories/{observation_id}",
    response_model=OwnerStoryObservationOut,
)
async def update_owner_story(
    dog_id: str,
    observation_id: str,
    payload: OwnerStoryUpdateRequest,
    state: StateDep,
    user_id: UserIdDep,
) -> OwnerStoryObservationOut:
    facts = _require_useful_facts(payload.facts)
    if state.engine is not None:
        row = await owner_stories_db.update_confirmed(
            state.engine,
            user_id=user_id,
            dog_id=dog_id,
            observation_id=observation_id,
            facts=facts,
        )
    else:
        observation = state.store.owner_reported_observations.get(
            observation_id
        )
        if (
            observation is None
            or observation["dog_id"] != dog_id
            or observation["user_id"] != user_id
            or observation["status"] != "CONFIRMED"
        ):
            raise ApiError(ErrorCode.NOT_FOUND, "Owner story not found")
        observation["facts"] = [
            fact.model_dump(mode="json") for fact in facts
        ]
        row = {
            "id": observation["id"],
            "dog_id": observation["dog_id"],
            "facts": observation["facts"],
            "confirmed_at": observation["confirmed_at"],
        }
    return OwnerStoryObservationOut.model_validate(row)


@router.delete(
    "/dogs/{dog_id}/owner-stories/{observation_id}",
    status_code=204,
)
async def delete_owner_story(
    dog_id: str,
    observation_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> Response:
    if state.engine is not None:
        await owner_stories_db.delete_observation(
            state.engine,
            user_id=user_id,
            dog_id=dog_id,
            observation_id=observation_id,
        )
        await recalculate_knowledge_score_db(state.engine, dog_id=dog_id)
    else:
        observation = state.store.owner_reported_observations.get(
            observation_id
        )
        if (
            observation is None
            or observation["dog_id"] != dog_id
            or observation["user_id"] != user_id
        ):
            raise ApiError(ErrorCode.NOT_FOUND, "Owner story not found")
        del state.store.owner_reported_observations[observation_id]
        recalculate_knowledge_score_memory(state.store, dog_id=dog_id)
    return Response(status_code=204)
