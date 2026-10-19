"""DOGly Realtime: governed conversations over the Personal Dog Model."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import IdempotencyDep, StateDep, UserIdDep, rate_limit
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.realtime import (
    LiveSessionCreate,
    LiveSessionOut,
    RealtimeDecision,
    RealtimeMemoryDecision,
    RealtimeMemoryDecisionOut,
    RealtimeMemoryProposal,
    RealtimeSessionCreate,
    RealtimeSessionOut,
    RealtimeTurnCreate,
    RealtimeTurnOut,
)
from app.contracts.taxonomy import AnalysisDomain
from app.domains import (
    behavior,
    behavior_db,
    digestive,
    digestive_db,
    gallery,
    gallery_db,
    idempotency_db,
    profiles_db,
    realtime_db,
)
from app.domains.gallery_db import GALLERY_BUCKET
from app.domains.realtime_context import (
    CONVERSATION_MESSAGE_LIMIT,
    CONVERSATION_TURN_LIMIT,
    REALTIME_CONTEXT_VERSION,
    build_open_threads,
    conversation_topic,
    focus_behavior_event,
    focus_digestive_event,
    load_realtime_context_db,
    load_realtime_context_memory,
    resume_welcome_text,
    route_realtime_domains,
)
from app.domains.realtime_orchestrator import (
    deterministic_safety_interrupt,
    natural_memory_candidate,
    orchestrate_realtime_turn,
)
from app.domains.repository import now_utc
from app.providers.base import ProviderUsage
from app.providers.budget import check_daily_budget
from app.providers.openai_live import (
    DEFAULT_LIVE_SECONDS,
    LIVE_MODEL,
    build_live_instructions,
    compact_live_dossier,
    create_live_webrtc_session,
    openai_voice_for_gender,
)
from app.providers.openai_reasoner import _estimate_openai_cost
from app.providers.personal_reasoning import recognize_attachment

router = APIRouter(prefix="/realtime")
logger = logging.getLogger(__name__)


def _is_owned_active_voice_session(
    session: dict[str, Any] | None, user_id: str
) -> bool:
    """Legacy predicate kept for stored-session migrations; no voice route uses it."""
    return bool(
        session
        and str(session.get("user_id")) == user_id
        and session.get("status") == "ACTIVE"
        and session.get("modality") == "VOICE"
    )


def _welcome_text(
    owner_name: str | None,
    dog_name: str,
    previous_topic: str | None = None,
    *,
    previous_turns: list[dict[str, Any]] | None = None,
) -> str:
    open_threads = build_open_threads(
        dog_name=dog_name,
        previous_turns=previous_turns,
    )
    return resume_welcome_text(
        owner_name,
        dog_name,
        previous_topic,
        open_thread=open_threads[0] if open_threads else None,
    )


async def _refresh_conversation_memory_best_effort(
    engine: Any,
    *,
    session_id: str,
    user_id: str,
) -> None:
    """Refresh continuity without invalidating an already persisted turn."""
    try:
        await realtime_db.refresh_conversation_memory_db(
            engine,
            session_id=session_id,
            user_id=user_id,
        )
    except Exception:
        # The turn row is the source of truth. A later turn or session close
        # can rebuild this projection, so a transient refresh failure must not
        # make the client retry and create a duplicate turn.
        logger.exception(
            "Realtime conversation memory refresh failed",
            extra={"session_id": session_id, "user_id": user_id},
        )


def _resume_history(
    previous: list[dict[str, Any]] | None,
    current: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Carry the last conversation into a new text session in model format."""
    resumed: list[dict[str, Any]] = []
    for item in previous or []:
        role = str(item.get("role") or "")
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        normalized = "user" if role in {"proprietario", "user"} else "assistant"
        entry: dict[str, Any] = {"role": normalized, "content": content}
        if normalized == "assistant":
            if item.get("question"):
                entry["question"] = item["question"]
            if item.get("media_invite"):
                entry["media_invite"] = item["media_invite"]
        resumed.append(entry)
    # Memory is refreshed after each turn and can already contain this session.
    # Merge the overlap instead of replaying the same exchange twice.
    overlap = 0
    for size in range(1, min(len(resumed), len(current)) + 1):
        if resumed[-size:] == current[:size]:
            overlap = size
    return (resumed + current[overlap:])[-CONVERSATION_MESSAGE_LIMIT:]


@router.post("/sessions", response_model=RealtimeSessionOut, status_code=201)
async def create_realtime_session(
    body: RealtimeSessionCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
    _: Annotated[
        None, Depends(rate_limit("realtime_session", limit=10, window_seconds=60))
    ],
) -> RealtimeSessionOut:
    if cached := guard.lookup():
        return RealtimeSessionOut.model_validate(cached)
    # Keep written conversations independent from the live audio model. This
    # avoids routing the reliable text-first experience through voice settings.
    model = state.settings.realtime_reasoning_model
    if state.engine is not None:
        row = await realtime_db.create_session_db(
            state.engine,
            user_id=user_id,
            dog_id=body.dog_id,
            modality=body.modality,
            model=model,
        )
    else:
        row = realtime_db.create_session_memory(
            state.store,
            user_id=user_id,
            dog_id=body.dog_id,
            modality=body.modality,
            model=model,
        )
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Cane non trovato.")
    previous_topic = (
        str(row["previous_topic"]) if row.get("previous_topic") else None
    )
    previous_turns = list(row.get("previous_turns") or [])
    response = RealtimeSessionOut(
        id=str(row["id"]),
        dog_id=str(row["dog_id"]),
        dog_name=str(row["dog_name"]),
        owner_display_name=(
            str(row["display_name"]) if row.get("display_name") else None
        ),
        previous_topic=previous_topic,
        welcome_text=_welcome_text(
            row.get("display_name"),
            str(row["dog_name"]),
            previous_topic,
            previous_turns=previous_turns,
        ),
        status=row["status"],
        modality=row["modality"],
        model=row["model"],
        started_at=row["started_at"],
        expires_at=row["expires_at"],
    )
    saved_response = response.model_dump(mode="json")
    guard.record(saved_response)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=saved_response,
            payload_hash=guard._payload_hash,
        )
    return response


@router.post("/live/sessions", response_model=LiveSessionOut, status_code=201)
async def create_live_session(
    body: LiveSessionCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
    _: Annotated[
        None, Depends(rate_limit("realtime_live_session", limit=6, window_seconds=60))
    ],
) -> LiveSessionOut:
    """Open the Live voice room (GPT-Live WebRTC; server exchanges SDP)."""
    if cached := guard.lookup():
        return LiveSessionOut.model_validate(cached)
    if state.settings.realtime_kill_switch or state.settings.ai_kill_switch:
        raise ApiError(ErrorCode.AI_BUDGET_EXCEEDED, "Live non disponibile al momento.")
    if not state.settings.openai_api_key:
        raise ApiError(ErrorCode.PROCESSING_FAILED, "Live non configurato.")
    if not body.sdp.strip():
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Offerta WebRTC mancante.")
    await check_daily_budget(
        state.engine,
        role="realtime_live",
        budget_usd=state.settings.reasoner_budget_usd_per_day,
        operation="realtime.live",
    )

    if state.engine is not None:
        profile = await profiles_db.get_or_create_profile(state.engine, user_id)
        row = await realtime_db.create_session_db(
            state.engine,
            user_id=user_id,
            dog_id=body.dog_id,
            modality="VOICE",
            model=LIVE_MODEL,
        )
    else:
        profile = state.store.ensure_profile(user_id)
        row = realtime_db.create_session_memory(
            state.store,
            user_id=user_id,
            dog_id=body.dog_id,
            modality="VOICE",
            model=LIVE_MODEL,
        )
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Cane non trovato.")

    gender = (
        profile.ask_voice_gender
        if getattr(profile, "ask_voice_gender", None) in {"FEMALE", "MALE"}
        else "FEMALE"
    )
    voice = openai_voice_for_gender(gender)
    previous_topic = (
        str(row["previous_topic"]) if row.get("previous_topic") else None
    )
    owner_name = str(row["display_name"]) if row.get("display_name") else None
    dog_name = str(row["dog_name"])
    # Light personal dossier so Live can connect recent analyses naturally
    # (e.g. bad stools + whimpering) without scripting the whole chat.
    dossier = ""
    try:
        if state.engine is not None:
            live_context = await load_realtime_context_db(
                state.engine,
                user_id=user_id,
                dog_id=body.dog_id,
                domains=["GENERAL", "BEHAVIOR", "DIGESTIVE", "CARE", "NUTRITION"],
                user_text="",
            )
        else:
            live_context = load_realtime_context_memory(
                state.store,
                dog_id=body.dog_id,
                domains=["GENERAL", "BEHAVIOR", "DIGESTIVE", "CARE", "NUTRITION"],
                user_text="",
            )
        dossier = compact_live_dossier(live_context)
    except Exception:
        logger.exception(
            "Live dossier load failed; continuing with open conversation",
            extra={"dog_id": body.dog_id, "user_id": user_id},
        )
    instructions = build_live_instructions(
        dog_name=dog_name,
        owner_name=owner_name,
        previous_topic=previous_topic,
        dossier=dossier,
    )
    try:
        minted = await create_live_webrtc_session(
            state.settings,
            instructions=instructions,
            voice=voice,
            sdp_offer=body.sdp,
            safety_identifier=user_id,
        )
    except ValueError as exc:
        if state.engine is not None:
            await realtime_db.end_session_db(
                state.engine, session_id=str(row["id"]), user_id=user_id
            )
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Offerta WebRTC non valida.") from exc
    except Exception as exc:
        logger.exception("Live GPT-Live session failed")
        if state.engine is not None:
            await realtime_db.end_session_db(
                state.engine, session_id=str(row["id"]), user_id=user_id
            )
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT,
            "Non riesco ad aprire la conversazione vocale. Riprova tra poco.",
        ) from exc

    response = LiveSessionOut(
        session_id=str(row["id"]),
        dog_id=str(row["dog_id"]),
        dog_name=dog_name,
        owner_display_name=owner_name,
        voice=str(minted.get("voice") or voice),
        voice_gender=gender,  # type: ignore[arg-type]
        sdp=str(minted["sdp"]),
        openai_session_id=(
            str(minted["openai_session_id"])
            if minted.get("openai_session_id")
            else None
        ),
        seconds_remaining=DEFAULT_LIVE_SECONDS,
        welcome_text=(
            f"Ciao{', ' + owner_name.split()[0] if owner_name else ''}. "
            f"Sono qui per parlare di {dog_name}."
        ),
        status="ACTIVE",
    )
    saved_response = response.model_dump(mode="json")
    guard.record(saved_response)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=saved_response,
            payload_hash=guard._payload_hash,
        )
    return response


@router.delete("/live/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_live_session(
    session_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> Response:
    if state.engine is not None:
        changed = await realtime_db.end_session_db(
            state.engine, session_id=session_id, user_id=user_id
        )
    else:
        session = state.store.realtime_sessions.get(session_id)
        changed = bool(
            session
            and str(session.get("user_id")) == user_id
            and session.get("status") == "ACTIVE"
        )
        if changed:
            session["status"] = "ENDED"
            session["ended_at"] = now_utc()
    if not changed:
        raise ApiError(ErrorCode.NOT_FOUND, "Sessione non trovata.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/sessions/{session_id}/turns", response_model=RealtimeTurnOut, status_code=201
)
async def create_realtime_turn(
    session_id: str,
    body: RealtimeTurnCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
    _: Annotated[
        None, Depends(rate_limit("realtime_turn", limit=20, window_seconds=60))
    ],
) -> RealtimeTurnOut:
    if cached := guard.lookup():
        return RealtimeTurnOut.model_validate(cached)
    if state.engine is not None:
        session = await realtime_db.load_session_db(
            state.engine, session_id=session_id, user_id=user_id
        )
    else:
        candidate = state.store.realtime_sessions.get(session_id)
        session = (
            candidate
            if candidate
            and candidate["user_id"] == user_id
            and candidate["status"] == "ACTIVE"
            else None
        )
    if session is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Conversazione non trovata.")
    if session["status"] != "ACTIVE" or session["expires_at"] <= now_utc():
        raise ApiError(ErrorCode.INVALID_STATE, "Questa conversazione è terminata.")

    attachment: dict[str, str] | None = None
    image_url: str | None = None
    if body.photo_id:
        if state.engine is not None:
            photo = await gallery_db.get_photo(
                state.engine, user_id=user_id, photo_id=body.photo_id
            )
        else:
            photo = gallery.get_photo(
                state.store, user_id=user_id, photo_id=body.photo_id
            )
        if str(photo.dog_id) != str(session["dog_id"]):
            raise ApiError(ErrorCode.NOT_FOUND, "Foto non trovata per questo cane.")
        try:
            image_url = await state.storage.create_signed_read_url(
                bucket=GALLERY_BUCKET,
                path=photo.storage_path,
                ttl_seconds=min(max(state.settings.storage_signed_url_ttl_seconds, 600), 1800),
            )
        except Exception as exc:
            raise ApiError(
                ErrorCode.PROCESSING_FAILED,
                "Non riesco a leggere questa foto. Riprova a inviarla.",
                retryable=True,
            ) from exc
        attachment = {
            "kind": "PHOTO",
            "photo_id": str(photo.id),
            "purpose": (body.photo_context or body.text).strip()[:280],
        }

    attachment_observation: dict[str, Any] | None = None
    context_query = body.text
    if image_url and not body.assistant_text and state.settings.openai_api_key:
        attachment_observation, attachment_usage = await recognize_attachment(
            state.settings, image_url=image_url, user_text=body.text
        )
        await state.cost_meter.record(
            usage=attachment_usage,
            operation="realtime.attachment_recognition",
            domain=AnalysisDomain.OWNER_STORY,
            event_id=session_id,
            user_id=user_id,
        )
        context_query = f"{body.text}\n{attachment_observation['description']}"
    domains = route_realtime_domains(context_query)
    if attachment_observation:
        domains = list(dict.fromkeys([*attachment_observation["domains"], *domains]))[:3]
    if body.context_source == "digestive" and "DIGESTIVE" not in domains:
        domains = ["DIGESTIVE", *domains][:3]
    # The route and context builder share the same bounded domain contract.
    context_domains = domains
    source_refs: list[dict[str, str]] = []
    try:
        if body.assistant_text:
            # Still pin the selected analysis so diary reopen / bridges stay on
            # THAT event even when the opening line is a fixed invite.
            if body.event_id and state.engine is not None:
                context = await load_realtime_context_db(
                    state.engine,
                    user_id=user_id,
                    dog_id=str(session["dog_id"]),
                    domains=context_domains,
                    user_text=context_query,
                )
                if body.context_source == "behavior":
                    focus_behavior_event(
                        context,
                        await behavior_db.get_event(
                            state.engine,
                            user_id=user_id,
                            event_id=body.event_id,
                        ),
                    )
                elif body.context_source == "digestive":
                    focus_digestive_event(
                        context,
                        await digestive_db.get_fecal_event(
                            state.engine,
                            user_id=user_id,
                            event_id=body.event_id,
                        ),
                    )
                source_refs = [
                    ref
                    for ref in context.source_refs()
                    if ref["source_id"] == body.event_id
                ][:1]
            elif body.event_id and state.engine is None:
                context = load_realtime_context_memory(
                    state.store,
                    dog_id=str(session["dog_id"]),
                    domains=context_domains,
                    user_text=context_query,
                )
                if body.context_source == "behavior":
                    focus_behavior_event(
                        context,
                        behavior.get_event(
                            state.store,
                            user_id=user_id,
                            event_id=body.event_id,
                        ),
                    )
                elif body.context_source == "digestive":
                    focus_digestive_event(
                        context,
                        digestive.get_fecal_event(
                            state.store,
                            user_id=user_id,
                            event_id=body.event_id,
                        ),
                    )
                source_refs = [
                    ref
                    for ref in context.source_refs()
                    if ref["source_id"] == body.event_id
                ][:1]
            decision = deterministic_safety_interrupt(body.text) or RealtimeDecision(
                assistant_text=body.assistant_text.strip(), domains=domains
            )
            provider_audit = {"provider": "text_bridge", "version": "text/v1"}
        elif state.engine is not None:
            context = await load_realtime_context_db(
                state.engine,
                user_id=user_id,
                dog_id=str(session["dog_id"]),
                domains=context_domains,
                user_text=context_query,
            )
            if body.event_id and body.context_source == "behavior":
                focus_behavior_event(
                    context,
                    await behavior_db.get_event(
                        state.engine,
                        user_id=user_id,
                        event_id=body.event_id,
                    ),
                )
            elif body.event_id and body.context_source == "digestive":
                focus_digestive_event(
                    context,
                    await digestive_db.get_fecal_event(
                        state.engine, user_id=user_id, event_id=body.event_id
                    ),
                )
            history, previous_memory = await asyncio.gather(
                realtime_db.load_history_db(
                    state.engine, session_id=session_id, user_id=user_id
                ),
                realtime_db.load_conversation_memory_db(
                    state.engine,
                    user_id=user_id,
                    dog_id=str(session["dog_id"]),
                ),
            )
            history = (
                history
                if body.event_id
                else _resume_history((previous_memory or {}).get("turns_json"), history)
            )
            decision, provider_audit = await orchestrate_realtime_turn(
                settings=state.settings,
                user_text=body.text,
                domains=domains,
                context=context,
                history=history,
                image_url=image_url,
                media_context=(
                    "\n".join(
                        value for value in [
                            body.photo_context,
                            (
                                "Soggetto osservato nell'allegato: "
                                + attachment_observation["description"]
                            ) if attachment_observation else None,
                        ] if value
                    ) or None
                ),
                latitude=body.latitude,
                longitude=body.longitude,
            )
            used = set(decision.used_source_ids)
            source_refs = [
                ref for ref in context.source_refs() if ref["source_id"] in used
            ]
        else:
            context = load_realtime_context_memory(
                state.store, dog_id=str(session["dog_id"]), domains=context_domains,
                user_text=context_query,
            )
            if body.event_id and body.context_source == "behavior":
                focus_behavior_event(
                    context,
                    behavior.get_event(
                        state.store,
                        user_id=user_id,
                        event_id=body.event_id,
                    ),
                )
            elif body.event_id and body.context_source == "digestive":
                focus_digestive_event(
                    context,
                    digestive.get_fecal_event(
                        state.store, user_id=user_id, event_id=body.event_id
                    ),
                )
            history = []
            for turn in state.store.realtime_turns.get(session_id, [])[
                -CONVERSATION_TURN_LIMIT:
            ]:
                history.extend(
                    [
                        {"role": "user", "content": turn["user_transcript"]},
                        {
                            "role": "assistant",
                            "content": turn["assistant_text"],
                            "question": (turn.get("decision_json") or {}).get("question"),
                            "media_invite": (turn.get("decision_json") or {}).get("media_invite"),
                        },
                    ]
                )
            previous_memory = state.store.realtime_conversation_memories.get(
                (user_id, str(session["dog_id"]))
            )
            history = (
                history
                if body.event_id
                else _resume_history((previous_memory or {}).get("turns_json"), history)
            )
            decision, provider_audit = await orchestrate_realtime_turn(
                settings=state.settings,
                user_text=body.text,
                domains=domains,
                context=context,
                history=history,
                image_url=image_url,
                media_context=body.photo_context,
                latitude=body.latitude,
                longitude=body.longitude,
            )
    except ApiError:
        raise
    except LookupError as exc:
        raise ApiError(ErrorCode.NOT_FOUND, "Cane non trovato.") from exc
    except Exception as exc:
        logger.exception(
            "Realtime turn context/provider failed",
            extra={
                "session_id": session_id,
                "dog_id": str(session.get("dog_id")),
                "user_id": user_id,
                "has_photo": bool(body.photo_id),
                "message_length": len(body.text or ""),
            },
        )
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "DOGly non riesce a rispondere in questo momento. Riprova tra poco.",
            retryable=True,
        ) from exc

    try:
        if attachment_observation:
            provider_audit = {
                **provider_audit,
                "attachment_observation": attachment_observation,
            }
        decision_json = decision.model_dump(mode="json")
        memory_request = natural_memory_candidate(body.text) or (
            dict(decision.memory_candidate)
            if decision.memory_candidate
            else None
        )
        if attachment is not None:
            decision_json["attachment"] = attachment
        if state.engine is not None:
            row, proposal = await realtime_db.record_turn_db(
                state.engine,
                session=session,
                user_text=body.text,
                decision=decision_json,
                context_version=REALTIME_CONTEXT_VERSION,
                source_refs=source_refs,
                provider_audit=provider_audit,
                memory_request=memory_request,
            )
            usage = provider_audit.get("usage")
            if state.engine is not None and provider_audit.get("provider") == "openai" and isinstance(usage, dict):
                await state.cost_meter.record(
                    usage=ProviderUsage(
                        provider="openai",
                        model=str(provider_audit.get("model") or state.settings.realtime_reasoning_model),
                        input_tokens=int(usage.get("prompt_tokens") or 0),
                        output_tokens=int(usage.get("completion_tokens") or 0),
                        cost_usd=_estimate_openai_cost(
                            usage,
                            input_usd_per_million=state.settings.realtime_input_usd_per_million,
                            output_usd_per_million=state.settings.realtime_output_usd_per_million,
                            safety_margin=state.settings.ai_cost_safety_margin,
                        ),
                        request_id=str(provider_audit.get("request_id") or ""),
                    ),
                    operation="realtime.chat",
                    domain=AnalysisDomain.OWNER_STORY,
                    event_id=session_id,
                    user_id=user_id,
                )
            await _refresh_conversation_memory_best_effort(
                state.engine,
                session_id=session_id,
                user_id=user_id,
            )
        else:
            row, proposal = _record_turn_memory(
                state.store,
                session=session,
                user_text=body.text,
                decision=decision_json,
                memory_request=memory_request,
            )
    except ApiError:
        raise
    except Exception as exc:
        logger.exception(
            "Realtime turn persistence failed",
            extra={
                "session_id": session_id,
                "dog_id": str(session.get("dog_id")),
                "user_id": user_id,
                "has_photo": bool(body.photo_id),
            },
        )
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "DOGly non riesce a salvare questa risposta. Riprova tra poco.",
            retryable=True,
        ) from exc
    memory = (
        RealtimeMemoryProposal(
            id=str(proposal["id"]),
            category=proposal["category"],
            statement=proposal["statement"],
        )
        if proposal
        else None
    )
    result = RealtimeTurnOut(
        id=str(row["id"]),
        session_id=session_id,
        assistant_text=decision.assistant_text,
        question=decision.question,
        question_options=decision.question_options,
        terminal_state=decision.terminal_state,
        domains=decision.domains,
        safety_flags=decision.safety_flags,
        memory_proposal=memory,
        media_invite=decision.media_invite,
        media_prompt=decision.media_prompt,
        attachment=attachment,
        behavior_handoff_href=(
            f"/behavior/capture?dogId={session['dog_id']}"
            if decision.behavior_handoff
            else None
        ),
        food_review_href=(
            "/nutrition/foods"
            if decision.suggest_food_review
            else None
        ),
        save_to_moments_suggested=bool(
            decision.suggest_save_to_moments and attachment is not None
        ),
        created_at=row["created_at"],
    )
    saved_response = result.model_dump(mode="json")
    guard.record(saved_response)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(state.engine, scope=guard._scope,
            body=saved_response, payload_hash=guard._payload_hash)
    return result


@router.post(
    "/memory-proposals/{proposal_id}/decision",
    response_model=RealtimeMemoryDecisionOut,
)
async def decide_realtime_memory(
    proposal_id: str,
    body: RealtimeMemoryDecision,
    state: StateDep,
    user_id: UserIdDep,
) -> RealtimeMemoryDecisionOut:
    if state.engine is not None:
        result = await realtime_db.decide_memory_db(
            state.engine,
            proposal_id=proposal_id,
            user_id=user_id,
            action=body.action,
        )
    else:
        proposal = state.store.realtime_memory_proposals.get(proposal_id)
        result = None
        if proposal and proposal["user_id"] == user_id and proposal["status"] == "PROPOSED":
            result = "CONFIRMED" if body.action == "CONFIRM" else "REJECTED"
            proposal["status"] = result
            proposal["decided_at"] = now_utc()
            if result == "CONFIRMED":
                needle = " ".join(str(proposal["statement"]).split()).casefold()
                duplicate = any(
                    needle
                    == " ".join(str(item.get("statement") or "").split()).casefold()
                    for row in state.store.owner_reported_observations.values()
                    if row.get("dog_id") == proposal["dog_id"]
                    and row.get("user_id") == user_id
                    and row.get("status") == "CONFIRMED"
                    for item in row.get("facts", [])
                    if isinstance(item, dict)
                )
                if not duplicate:
                    observation_id = str(uuid.uuid4())
                    state.store.owner_reported_observations[observation_id] = {
                        "id": observation_id,
                        "dog_id": proposal["dog_id"],
                        "user_id": user_id,
                        "facts": [
                            {
                                "id": str(uuid.uuid4()),
                                "category": proposal["category"],
                                "statement": proposal["statement"],
                                "provenance": "OWNER_REPORTED",
                                "source": "REALTIME_CONFIRMATION",
                            }
                        ],
                        "status": "CONFIRMED",
                        "confirmed_at": now_utc(),
                    }
    if result is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Proposta non trovata o già gestita.")
    return RealtimeMemoryDecisionOut(proposal_id=proposal_id, status=result)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_realtime_session(
    session_id: str, state: StateDep, user_id: UserIdDep
) -> Response:
    if state.engine is not None:
        changed = await realtime_db.end_session_db(
            state.engine, session_id=session_id, user_id=user_id
        )
    else:
        session = state.store.realtime_sessions.get(session_id)
        changed = bool(
            session and session["user_id"] == user_id and session["status"] == "ACTIVE"
        )
        if changed:
            session["status"] = "ENDED"
            session["ended_at"] = now_utc()
            _store_conversation_memory(state.store, session)
    if not changed:
        raise ApiError(ErrorCode.NOT_FOUND, "Conversazione non trovata.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _record_turn_memory(
    store: Any,
    *,
    session: dict[str, Any],
    user_text: str,
    decision: dict[str, Any],
    memory_request: dict[str, str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    turns = store.realtime_turns.setdefault(session["id"], [])
    row = {
        "id": str(uuid.uuid4()),
        "session_id": session["id"],
        "user_id": session["user_id"],
        "dog_id": session["dog_id"],
        "ordinal": len(turns) + 1,
        "user_transcript": user_text,
        "assistant_text": decision["assistant_text"],
        "decision_json": decision,
        "created_at": now_utc(),
    }
    turns.append(row)
    proposal = None
    if memory_request:
        proposal = {
            "id": str(uuid.uuid4()),
            "session_id": session["id"],
            "source_turn_id": row["id"],
            "dog_id": session["dog_id"],
            "user_id": session["user_id"],
            "category": memory_request["category"],
            "statement": memory_request["statement"],
            "status": "PROPOSED",
            "created_at": now_utc(),
        }
        store.realtime_memory_proposals[proposal["id"]] = proposal
    session["last_active_at"] = now_utc()
    _store_conversation_memory(store, session)
    return row, proposal


def _store_conversation_memory(store: Any, session: dict[str, Any]) -> None:
    turns = store.realtime_turns.get(session["id"], [])
    if not turns:
        return
    dog = store.dogs.get(session["dog_id"])
    topic = conversation_topic(
        [str(turn["user_transcript"]) for turn in turns],
        dog_name=getattr(dog, "name", "il cane"),
    )
    history = []
    for turn in turns[-CONVERSATION_TURN_LIMIT:]:
        history.append({"role": "proprietario", "content": turn["user_transcript"]})
        decision = turn.get("decision_json") or {}
        history.append(
            {
                "role": "DOGly",
                "content": turn["assistant_text"],
                "question": decision.get("question"),
                "media_invite": decision.get("media_invite"),
            }
        )
    store.realtime_conversation_memories[(session["user_id"], session["dog_id"])] = {
        "topic": topic,
        "turns_json": history,
    }
