"""Persistence boundary for short-lived conversational state."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domains.realtime_context import conversation_topic
from app.domains.repository import InMemoryStore, now_utc


async def load_conversation_memory_db(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select topic, turns_json, last_talked_at
                    from public.realtime_conversation_memories
                    where user_id=cast(:user_id as uuid)
                      and dog_id=cast(:dog_id as uuid)
                    """
                ),
                {"user_id": user_id, "dog_id": dog_id},
            )
        ).mappings().one_or_none()
    return dict(row) if row else None


async def upsert_conversation_memory_db(
    engine: AsyncEngine,
    *,
    session: dict[str, Any],
    dog_name: str,
    turns: list[dict[str, Any]],
) -> dict[str, Any] | None:
    user_texts = [str(turn.get("user_transcript") or "") for turn in turns]
    if not any(text.strip() for text in user_texts):
        return None
    topic = conversation_topic(user_texts, dog_name=dog_name)
    history: list[dict[str, str]] = []
    for turn in turns[-4:]:
        history.append({"role": "proprietario", "content": turn["user_transcript"]})
        history.append({"role": "DOGly", "content": turn["assistant_text"]})
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.realtime_conversation_memories(
                      dog_id, user_id, last_session_id, topic, turns_json, last_talked_at
                    ) values (
                      cast(:dog_id as uuid), cast(:user_id as uuid),
                      cast(:session_id as uuid), :topic, cast(:turns as jsonb), now()
                    )
                    on conflict (user_id, dog_id) do update set
                      last_session_id=excluded.last_session_id,
                      topic=excluded.topic,
                      turns_json=excluded.turns_json,
                      last_talked_at=now()
                    returning topic, turns_json, last_talked_at
                    """
                ),
                {
                    "dog_id": str(session["dog_id"]),
                    "user_id": str(session["user_id"]),
                    "session_id": str(session["id"]),
                    "topic": topic,
                    "turns": _json(history),
                },
            )
        ).mappings().one()
    return dict(row)


async def refresh_conversation_memory_db(
    engine: AsyncEngine, *, session_id: str, user_id: str
) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        session = (
            await conn.execute(
                text(
                    """
                    select s.id, s.user_id, s.dog_id, d.name as dog_name
                    from public.realtime_sessions s
                    join public.dogs d on d.id=s.dog_id
                    where s.id=cast(:session_id as uuid)
                      and s.user_id=cast(:user_id as uuid)
                    """
                ),
                {"session_id": session_id, "user_id": user_id},
            )
        ).mappings().one_or_none()
        if session is None:
            return None
        turns = (
            await conn.execute(
                text(
                    """
                    select user_transcript, assistant_text
                    from public.realtime_turns
                    where session_id=cast(:session_id as uuid)
                    order by ordinal
                    """
                ),
                {"session_id": session_id},
            )
        ).mappings().all()
    return await upsert_conversation_memory_db(
        engine,
        session=dict(session),
        dog_name=str(session["dog_name"]),
        turns=[dict(turn) for turn in turns],
    )


async def create_session_db(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    modality: str,
    model: str,
) -> dict[str, Any] | None:
    async with engine.begin() as conn:
        previous = (
            await conn.execute(
                text(
                    """
                    select s.id, d.name as dog_name
                    from public.realtime_sessions s
                    join public.dogs d on d.id=s.dog_id
                    where s.user_id=cast(:user_id as uuid)
                      and s.dog_id=cast(:dog_id as uuid)
                      and s.status='ACTIVE'
                    order by s.last_active_at desc
                    """
                ),
                {"user_id": user_id, "dog_id": dog_id},
            )
        ).mappings().all()
        for old in previous:
            turns = (
                await conn.execute(
                    text(
                        """
                        select user_transcript, assistant_text
                        from public.realtime_turns
                        where session_id=cast(:session_id as uuid)
                        order by ordinal
                        """
                    ),
                    {"session_id": str(old["id"])},
                )
            ).mappings().all()
            if turns:
                topic = conversation_topic(
                    [str(turn["user_transcript"]) for turn in turns],
                    dog_name=str(old["dog_name"]),
                )
                history = []
                for turn in list(turns)[-4:]:
                    history.append(
                        {"role": "proprietario", "content": turn["user_transcript"]}
                    )
                    history.append({"role": "DOGly", "content": turn["assistant_text"]})
                await conn.execute(
                    text(
                        """
                        insert into public.realtime_conversation_memories(
                          dog_id, user_id, last_session_id, topic, turns_json, last_talked_at
                        ) values (
                          cast(:dog_id as uuid), cast(:user_id as uuid),
                          cast(:session_id as uuid), :topic, cast(:turns as jsonb), now()
                        )
                        on conflict (user_id, dog_id) do update set
                          last_session_id=excluded.last_session_id,
                          topic=excluded.topic,
                          turns_json=excluded.turns_json,
                          last_talked_at=now()
                        """
                    ),
                    {
                        "dog_id": dog_id,
                        "user_id": user_id,
                        "session_id": str(old["id"]),
                        "topic": topic,
                        "turns": _json(history),
                    },
                )
            await conn.execute(
                text(
                    """
                    update public.realtime_sessions
                    set status='ENDED', ended_at=now()
                    where id=cast(:session_id as uuid)
                    """
                ),
                {"session_id": str(old["id"])},
            )
        await conn.execute(
            text(
                """
                delete from public.realtime_sessions
                where status in ('ENDED', 'EXPIRED')
                  and coalesce(ended_at, last_active_at) < now() - interval '14 days'
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
        memory = (
            await conn.execute(
                text(
                    """
                    select topic, turns_json
                    from public.realtime_conversation_memories
                    where user_id=cast(:user_id as uuid)
                      and dog_id=cast(:dog_id as uuid)
                    """
                ),
                {"user_id": user_id, "dog_id": dog_id},
            )
        ).mappings().one_or_none()
    if row is None:
        return None
    payload = dict(row)
    if memory:
        payload["previous_topic"] = memory["topic"]
        payload["previous_turns"] = memory["turns_json"] or []
    return payload


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
    if result.rowcount:
        await refresh_conversation_memory_db(
            engine, session_id=session_id, user_id=user_id
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
    previous = store.realtime_conversation_memories.get((user_id, dog_id))
    if previous:
        row["previous_topic"] = previous.get("topic")
        row["previous_turns"] = previous.get("turns_json") or []
    store.realtime_sessions[row["id"]] = row
    store.realtime_turns[row["id"]] = []
    return row


def _json(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, default=str)
