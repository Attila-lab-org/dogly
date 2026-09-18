"""Persistence boundary for short-lived conversational state."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domains.repository import InMemoryStore, now_utc


async def create_session_db(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    modality: str,
    model: str,
) -> dict[str, Any] | None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                delete from public.realtime_sessions
                where expires_at <= now() or ended_at < now() - interval '24 hours'
                """
            )
        )
        row = (
            await conn.execute(
                text(
                    """
                    with inserted as (
                      insert into public.realtime_sessions(
                        user_id, dog_id, modality, model
                      )
                      select cast(:user_id as uuid), d.id, :modality, :model
                      from public.dogs d
                      where d.id=cast(:dog_id as uuid)
                        and d.owner_id=cast(:user_id as uuid)
                      returning *
                    )
                    select inserted.*, d.name as dog_name, p.display_name
                    from inserted
                    join public.dogs d on d.id=inserted.dog_id
                    left join public.profiles p on p.user_id=inserted.user_id
                    """
                ),
                {
                    "user_id": user_id,
                    "dog_id": dog_id,
                    "modality": modality,
                    "model": model,
                },
            )
        ).mappings().one_or_none()
    return dict(row) if row else None


async def load_session_db(
    engine: AsyncEngine, *, session_id: str, user_id: str
) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select * from public.realtime_sessions
                    where id=cast(:session_id as uuid)
                      and user_id=cast(:user_id as uuid)
                    """
                ),
                {"session_id": session_id, "user_id": user_id},
            )
        ).mappings().one_or_none()
    return dict(row) if row else None


async def load_history_db(
    engine: AsyncEngine, *, session_id: str, user_id: str
) -> list[dict[str, str]]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select user_transcript, assistant_text
                    from public.realtime_turns
                    where session_id=cast(:session_id as uuid)
                      and user_id=cast(:user_id as uuid)
                    order by ordinal desc
                    limit 3
                    """
                ),
                {"session_id": session_id, "user_id": user_id},
            )
        ).mappings().all()
    history: list[dict[str, str]] = []
    for row in reversed(rows):
        history.extend(
            [
                {"role": "user", "content": row["user_transcript"]},
                {"role": "assistant", "content": row["assistant_text"]},
            ]
        )
    return history


async def record_turn_db(
    engine: AsyncEngine,
    *,
    session: dict[str, Any],
    user_text: str,
    decision: dict[str, Any],
    context_version: str,
    source_refs: list[dict[str, str]],
    provider_audit: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    async with engine.begin() as conn:
        locked = (
            await conn.execute(
                text(
                    """
                    select id from public.realtime_sessions
                    where id=cast(:session_id as uuid)
                      and user_id=cast(:user_id as uuid)
                      and status='ACTIVE' and expires_at > now()
                    for update
                    """
                ),
                {"session_id": str(session["id"]), "user_id": str(session["user_id"])},
            )
        ).scalar_one_or_none()
        if locked is None:
            raise LookupError("Realtime session is no longer active")
        ordinal = (
            await conn.execute(
                text(
                    """
                    select coalesce(max(ordinal), 0) + 1
                    from public.realtime_turns
                    where session_id=cast(:session_id as uuid)
                    """
                ),
                {"session_id": str(session["id"])},
            )
        ).scalar_one()
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.realtime_turns(
                      session_id, dog_id, user_id, ordinal, user_transcript,
                      assistant_text, concern_frame, decision_json, question,
                      terminal_state, safety_flags
                    ) values (
                      cast(:session_id as uuid), cast(:dog_id as uuid),
                      cast(:user_id as uuid), :ordinal, :user_text,
                      :assistant_text, cast(:concern_frame as jsonb),
                      cast(:decision_json as jsonb), :question,
                      :terminal_state, cast(:safety_flags as jsonb)
                    )
                    returning *
                    """
                ),
                {
                    "session_id": str(session["id"]),
                    "dog_id": str(session["dog_id"]),
                    "user_id": str(session["user_id"]),
                    "ordinal": ordinal,
                    "user_text": user_text,
                    "assistant_text": decision["assistant_text"],
                    "concern_frame": _json({"domains": decision["domains"]}),
                    "decision_json": _json(decision),
                    "question": decision.get("question"),
                    "terminal_state": decision["terminal_state"],
                    "safety_flags": _json(decision["safety_flags"]),
                },
            )
        ).mappings().one()
        await conn.execute(
            text(
                """
                insert into internal.realtime_context_receipts(
                  turn_id, context_version, source_refs, retrieval_audit
                ) values (
                  cast(:turn_id as uuid), :context_version,
                  cast(:source_refs as jsonb), cast(:audit as jsonb)
                )
                """
            ),
            {
                "turn_id": str(row["id"]),
                "context_version": context_version,
                "source_refs": _json(source_refs),
                "audit": _json(provider_audit),
            },
        )
        proposal: dict[str, Any] | None = None
        if decision.get("memory_candidate"):
            proposal_row = (
                await conn.execute(
                    text(
                        """
                        insert into public.memory_proposals(
                          session_id, source_turn_id, dog_id, user_id,
                          category, statement
                        ) values (
                          cast(:session_id as uuid), cast(:turn_id as uuid),
                          cast(:dog_id as uuid), cast(:user_id as uuid),
                          :category, :statement
                        )
                        returning *
                        """
                    ),
                    {
                        "session_id": str(session["id"]),
                        "turn_id": str(row["id"]),
                        "dog_id": str(session["dog_id"]),
                        "user_id": str(session["user_id"]),
                        "category": decision["memory_category"],
                        "statement": decision["memory_candidate"],
                    },
                )
            ).mappings().one()
            proposal = dict(proposal_row)
        await conn.execute(
            text(
                """
                update public.realtime_sessions
                set last_active_at=now()
                where id=cast(:session_id as uuid)
                """
            ),
            {"session_id": str(session["id"])},
        )
    return dict(row), proposal


async def decide_memory_db(
    engine: AsyncEngine,
    *,
    proposal_id: str,
    user_id: str,
    action: str,
) -> str | None:
    target_status = "CONFIRMED" if action == "CONFIRM" else "REJECTED"
    async with engine.begin() as conn:
        proposal = (
            await conn.execute(
                text(
                    """
                    update public.memory_proposals
                    set status=:status, decided_at=now()
                    where id=cast(:proposal_id as uuid)
                      and user_id=cast(:user_id as uuid)
                      and status='PROPOSED' and expires_at > now()
                    returning *
                    """
                ),
                {
                    "proposal_id": proposal_id,
                    "user_id": user_id,
                    "status": target_status,
                },
            )
        ).mappings().one_or_none()
        if proposal is None:
            return None
        if target_status == "CONFIRMED":
            fact = {
                "category": proposal["category"],
                "statement": proposal["statement"],
                "provenance": "OWNER_REPORTED",
                "source": "REALTIME_CONFIRMATION",
            }
            await conn.execute(
                text(
                    """
                    insert into public.owner_reported_observations(
                      dog_id, user_id, transcript, facts_json, status, confirmed_at
                    ) values (
                      cast(:dog_id as uuid), cast(:user_id as uuid), :transcript,
                      cast(:facts as jsonb), 'CONFIRMED', now()
                    )
                    """
                ),
                {
                    "dog_id": str(proposal["dog_id"]),
                    "user_id": user_id,
                    "transcript": f"Confermato in conversazione: {proposal['statement']}",
                    "facts": _json([fact]),
                },
            )
    return target_status


async def end_session_db(
    engine: AsyncEngine, *, session_id: str, user_id: str
) -> bool:
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                """
                update public.realtime_sessions
                set status='ENDED', ended_at=now()
                where id=cast(:session_id as uuid)
                  and user_id=cast(:user_id as uuid)
                  and status='ACTIVE'
                """
            ),
            {"session_id": session_id, "user_id": user_id},
        )
    return bool(result.rowcount)


def create_session_memory(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    modality: str,
    model: str,
) -> dict[str, Any] | None:
    dog = store.dogs.get(dog_id)
    if dog is None or dog.owner_id != user_id:
        return None
    now = now_utc()
    row = {
        "id": str(uuid.uuid4()),
        "dog_id": dog_id,
        "user_id": user_id,
        "status": "ACTIVE",
        "modality": modality,
        "model": model,
        "context_snapshot_version": "personal-dog-context/v1",
        "started_at": now,
        "last_active_at": now,
        "expires_at": now + timedelta(hours=24),
        "dog_name": dog.name,
        "display_name": getattr(store.profiles.get(user_id), "display_name", None),
    }
    store.realtime_sessions[row["id"]] = row
    store.realtime_turns[row["id"]] = []
    return row


def _json(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, default=str)
