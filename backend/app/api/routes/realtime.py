"""DOGly Realtime: governed conversations over the Personal Dog Model."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, Response, status

from app.api.deps import StateDep, UserIdDep, rate_limit
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.realtime import (
    RealtimeClientSecretOut,
    RealtimeMemoryDecision,
    RealtimeMemoryDecisionOut,
    RealtimeMemoryProposal,
    RealtimeSessionCreate,
    RealtimeSessionOut,
    RealtimeTurnCreate,
    RealtimeTurnOut,
)
from app.domains import realtime_db
from app.domains.realtime_context import (
    REALTIME_CONTEXT_VERSION,
    load_realtime_context_db,
    load_realtime_context_memory,
    route_realtime_domains,
)
from app.domains.realtime_orchestrator import orchestrate_realtime_turn
from app.domains.repository import now_utc
from app.providers.openai_realtime import create_realtime_client_secret

router = APIRouter(prefix="/realtime")


def _is_owned_active_voice_session(
    session: dict[str, Any] | None, user_id: str
) -> bool:
    return bool(
        session
        and str(session["user_id"]) == user_id
        and session["status"] == "ACTIVE"
        and session["modality"] == "VOICE"
    )


def _welcome_text(owner_name: str | None, dog_name: str) -> str:
    first_name = (owner_name or "").strip().split(" ", 1)[0].capitalize()
    if first_name:
        return (
            f"Ciao {first_name}, sono qui per te e {dog_name}. "
            "Cosa vuoi capire oggi?"
        )
    return f"Ciao, sono qui per te e {dog_name}. Cosa vuoi capire oggi?"


@router.post("/sessions", response_model=RealtimeSessionOut, status_code=201)
async def create_realtime_session(
    body: RealtimeSessionCreate,
    state: StateDep,
    user_id: UserIdDep,
    _: Annotated[
        None, Depends(rate_limit("realtime_session", limit=10, window_seconds=60))
    ],
) -> RealtimeSessionOut:
    model = state.settings.realtime_voice_model
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
    return RealtimeSessionOut(
        id=str(row["id"]),
        dog_id=str(row["dog_id"]),
        dog_name=str(row["dog_name"]),
        owner_display_name=(
            str(row["display_name"]) if row.get("display_name") else None
        ),
        welcome_text=_welcome_text(row.get("display_name"), str(row["dog_name"])),
        status=row["status"],
        modality=row["modality"],
        model=row["model"],
        started_at=row["started_at"],
        expires_at=row["expires_at"],
    )


@router.post(
    "/sessions/{session_id}/client-secret",
    response_model=RealtimeClientSecretOut,
)
async def create_voice_client_secret(
    session_id: str,
    state: StateDep,
    user_id: UserIdDep,
    _: Annotated[
        None, Depends(rate_limit("realtime_secret", limit=6, window_seconds=60))
    ],
) -> RealtimeClientSecretOut:
    if state.engine is not None:
        session = await realtime_db.load_session_db(
            state.engine, session_id=session_id, user_id=user_id
        )
    else:
        session = state.store.realtime_sessions.get(session_id)
    if not _is_owned_active_voice_session(session, user_id):
        raise ApiError(ErrorCode.NOT_FOUND, "Conversazione vocale non trovata.")
    if (
        not state.settings.realtime_enabled
        or state.settings.realtime_kill_switch
        or not state.settings.openai_api_key
    ):
        raise ApiError(
            ErrorCode.INVALID_STATE, "La conversazione vocale non è ancora disponibile."
        )
    try:
        secret = await create_realtime_client_secret(
            state.settings, user_id=user_id
        )
    except httpx.HTTPError as exc:
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "La voce DOGly non è disponibile in questo momento.",
            retryable=True,
        ) from exc
    return RealtimeClientSecretOut(
        value=secret["value"],
        expires_at=secret["expires_at"],
        model=state.settings.realtime_voice_model,
        session_config={
            "voice": state.settings.realtime_voice,
            "turn_detection": "semantic_vad",
        },
    )


@router.post(
    "/sessions/{session_id}/turns", response_model=RealtimeTurnOut, status_code=201
)
async def create_realtime_turn(
    session_id: str,
    body: RealtimeTurnCreate,
    state: StateDep,
    user_id: UserIdDep,
    _: Annotated[
        None, Depends(rate_limit("realtime_turn", limit=20, window_seconds=60))
    ],
) -> RealtimeTurnOut:
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

    domains = route_realtime_domains(body.text)
    try:
        if state.engine is not None:
            context = await load_realtime_context_db(
                state.engine,
                user_id=user_id,
                dog_id=str(session["dog_id"]),
                domains=domains,
            )
            history = await realtime_db.load_history_db(
                state.engine, session_id=session_id, user_id=user_id
            )
        else:
            context = load_realtime_context_memory(
                state.store, dog_id=str(session["dog_id"]), domains=domains
            )
            history = []
            for turn in state.store.realtime_turns.get(session_id, [])[-3:]:
                history.extend(
                    [
                        {"role": "user", "content": turn["user_transcript"]},
                        {"role": "assistant", "content": turn["assistant_text"]},
                    ]
                )
        decision, provider_audit = await orchestrate_realtime_turn(
            settings=state.settings,
            user_text=body.text,
            domains=domains,
            context=context,
            history=history,
        )
    except LookupError as exc:
        raise ApiError(ErrorCode.NOT_FOUND, "Cane non trovato.") from exc
    except Exception as exc:
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "DOGly non riesce a rispondere in questo momento. Riprova tra poco.",
            retryable=True,
        ) from exc

    decision_json = decision.model_dump(mode="json")
    used = set(decision.used_source_ids)
    source_refs = [
        ref for ref in context.source_refs() if ref["source_id"] in used
    ]
    if state.engine is not None:
        row, proposal = await realtime_db.record_turn_db(
            state.engine,
            session=session,
            user_text=body.text,
            decision=decision_json,
            context_version=REALTIME_CONTEXT_VERSION,
            source_refs=source_refs,
            provider_audit=provider_audit,
        )
    else:
        row, proposal = _record_turn_memory(
            state.store,
            session=session,
            user_text=body.text,
            decision=decision_json,
        )
    memory = (
        RealtimeMemoryProposal(
            id=str(proposal["id"]),
            category=proposal["category"],
            statement=proposal["statement"],
        )
        if proposal
        else None
    )
    return RealtimeTurnOut(
        id=str(row["id"]),
        session_id=session_id,
        assistant_text=decision.assistant_text,
        question=decision.question,
        terminal_state=decision.terminal_state,
        domains=decision.domains,
        safety_flags=decision.safety_flags,
        memory_proposal=memory,
        behavior_handoff_href=(
            f"/behavior/capture?dogId={session['dog_id']}"
            if decision.behavior_handoff
            else None
        ),
        created_at=row["created_at"],
    )


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
                observation_id = str(uuid.uuid4())
                state.store.owner_reported_observations[observation_id] = {
                    "id": observation_id,
                    "dog_id": proposal["dog_id"],
                    "user_id": user_id,
                    "facts_json": [
                        {
                            "category": proposal["category"],
                            "statement": proposal["statement"],
                            "provenance": "OWNER_REPORTED",
                            "source": "REALTIME_CONFIRMATION",
                        }
                    ],
                    "status": "CONFIRMED",
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
    if not changed:
        raise ApiError(ErrorCode.NOT_FOUND, "Conversazione non trovata.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _record_turn_memory(
    store: Any,
    *,
    session: dict[str, Any],
    user_text: str,
    decision: dict[str, Any],
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
    if decision.get("memory_candidate"):
        proposal = {
            "id": str(uuid.uuid4()),
            "session_id": session["id"],
            "source_turn_id": row["id"],
            "dog_id": session["dog_id"],
            "user_id": session["user_id"],
            "category": decision["memory_category"],
            "statement": decision["memory_candidate"],
            "status": "PROPOSED",
            "created_at": now_utc(),
        }
        store.realtime_memory_proposals[proposal["id"]] = proposal
    session["last_active_at"] = now_utc()
    return row, proposal
