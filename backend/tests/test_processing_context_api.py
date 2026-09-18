"""Processing context API: ownership, allowlist, skip, reasoner wiring."""

from __future__ import annotations

import httpx

from app.contracts.taxonomy import BehaviorEventStatus
from app.domains import processing_context_store
from app.domains.processing_context import owner_facts_for_reasoner
from app.worker.handlers import process_behavior_event
from tests.conftest import create_dog, make_token


async def _queue_event(
    client,
    headers,
    crid: str,
    *,
    context_bucket: str = "HOME",
    has_audio: bool = True,
    state=None,
) -> str:
    if state is not None and getattr(state, "queue", None) is not None:
        # Keep the event in processing so companion questions stay visible.
        state.queue.dispatcher = None
    dog_id = await create_dog(client, headers)
    started = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": dog_id,
            "client_request_id": crid,
            "duration_ms": 8000,
            "has_audio": has_audio,
            "bytes": 1_000_000,
            "content_type": "video/mp4",
            "context_bucket": context_bucket,
        },
        headers=headers,
    )
    assert started.status_code == 200, started.text
    capture_id = started.json()["capture_id"]
    completed = await client.post(
        f"/v1/behavior/captures/{capture_id}/complete", headers=headers
    )
    assert completed.status_code == 200, completed.text
    return completed.json()["event_id"]


async def test_get_returns_one_structured_question(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-get-0001", state=state)
    resp = await client.get(
        f"/v1/behavior/events/{event_id}/processing-context",
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["event_id"] == event_id
    assert body["max_questions"] == 3
    assert body["answered_count"] == 0
    assert body["question"] is not None
    assert 2 <= len(body["question"]["options"]) <= 4
    assert "confidence" not in body["question"]["text"].lower()


async def test_unknown_answer_is_rejected(client: httpx.AsyncClient, auth_headers, state):
    event_id = await _queue_event(client, auth_headers, "proc-bad-0001", state=state)
    shown = await client.get(
        f"/v1/behavior/events/{event_id}/processing-context",
        headers=auth_headers,
    )
    question_id = shown.json()["question"]["id"]
    bad = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={"question_id": question_id, "answer_id": "invented"},
        headers=auth_headers,
    )
    assert bad.status_code == 422
    unknown = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={"question_id": "not_a_real_question", "answer_id": "usual"},
        headers=auth_headers,
    )
    assert unknown.status_code == 422


async def test_skip_occupies_slot_but_is_not_a_fact(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-skip-0001", state=state)
    first = (
        await client.get(
            f"/v1/behavior/events/{event_id}/processing-context",
            headers=auth_headers,
        )
    ).json()["question"]
    skipped = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={"question_id": first["id"], "skipped": True},
        headers=auth_headers,
    )
    assert skipped.status_code == 200, skipped.text
    body = skipped.json()
    assert body["answered_count"] == 0
    assert body["question"] is None or body["question"]["id"] != first["id"]
    rows = processing_context_store.list_answers(
        state.store, event_id=event_id, user_id=state.store.behavior_events[event_id].user_id
    )
    facts = owner_facts_for_reasoner(rows)
    assert facts == []


async def test_duplicate_post_is_idempotent(client: httpx.AsyncClient, auth_headers, state):
    event_id = await _queue_event(client, auth_headers, "proc-idem-0001", state=state)
    question = (
        await client.get(
            f"/v1/behavior/events/{event_id}/processing-context",
            headers=auth_headers,
        )
    ).json()["question"]
    payload = {
        "question_id": question["id"],
        "answer_id": question["options"][0]["id"],
    }
    first = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json=payload,
        headers=auth_headers,
    )
    second = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json=payload,
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["answered_count"] == 1
    assert second.json()["answered_count"] == 1
    assert first.json()["question"] == second.json()["question"]


async def test_other_user_cannot_read_or_write(
    client: httpx.AsyncClient, auth_headers, rsa_keys, state
):
    event_id = await _queue_event(client, auth_headers, "proc-own-0001", state=state)
    other = {"Authorization": f"Bearer {make_token(rsa_keys[0])}"}
    leaked = await client.get(
        f"/v1/behavior/events/{event_id}/processing-context",
        headers=other,
    )
    assert leaked.status_code == 404
    written = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={"question_id": "usual_situation", "answer_id": "usual"},
        headers=other,
    )
    assert written.status_code == 404


async def test_completed_event_hides_questions(
    client: httpx.AsyncClient, worker_client, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-done-0001", state=state)
    processed = await worker_client.post(
        "/tasks/run",
        json={"task_type": "behavior_analysis", "event_id": event_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert processed.status_code == 200
    hidden = await client.get(
        f"/v1/behavior/events/{event_id}/processing-context",
        headers=auth_headers,
    )
    assert hidden.status_code == 200
    assert hidden.json()["question"] is None


async def test_rejected_quality_stays_rejected_even_with_answers(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-rej-0001", state=state)
    event = state.store.behavior_events[event_id]
    event.status = BehaviorEventStatus.REJECTED_QUALITY
    event.observation_json = {
        "capture_quality": {"overall_quality": "insufficient"}
    }
    shown = await client.get(
        f"/v1/behavior/events/{event_id}/processing-context",
        headers=auth_headers,
    )
    assert shown.json()["question"] is None
    late = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={"question_id": "usual_situation", "answer_id": "usual"},
        headers=auth_headers,
    )
    assert late.status_code == 422
    assert state.store.behavior_events[event_id].status is BehaviorEventStatus.REJECTED_QUALITY


async def test_answers_reach_reasoner_as_owner_reported(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-rea-0001", state=state)
    question = (
        await client.get(
            f"/v1/behavior/events/{event_id}/processing-context",
            headers=auth_headers,
        )
    ).json()["question"]
    await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={
            "question_id": question["id"],
            "answer_id": question["options"][0]["id"],
        },
        headers=auth_headers,
    )

    captured: dict = {}
    inner = state.reasoner

    class CaptureReasoner:
        async def interpret(self, **kwargs):
            captured.update(kwargs)
            return await inner.interpret(**kwargs)

    state.reasoner = CaptureReasoner()
    result = await process_behavior_event(state, event_id=event_id)
    assert result["status"] == "COMPLETED"
    facts = captured["processing_owner_context"]
    assert facts
    assert facts[0]["provenance"] == "OWNER_REPORTED"
    assert facts[0]["question_id"] == question["id"]
    assert "deterministic_safety_flags" in captured
    stored = state.store.behavior_events[event_id].interpretation_json
    assert stored["processing_owner_context"] == facts


async def test_no_answers_keeps_reasoner_context_empty(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-empty-0001", state=state)
    captured: dict = {}
    inner = state.reasoner

    class CaptureReasoner:
        async def interpret(self, **kwargs):
            captured.update(kwargs)
            return await inner.interpret(**kwargs)

    state.reasoner = CaptureReasoner()
    result = await process_behavior_event(state, event_id=event_id)
    assert result["status"] == "COMPLETED"
    assert captured["processing_owner_context"] == []


async def test_server_rejects_unoffered_and_fourth_question(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-offered-0001", state=state)
    first = (
        await client.get(
            f"/v1/behavior/events/{event_id}/processing-context",
            headers=auth_headers,
        )
    ).json()["question"]
    other = "usual_situation" if first["id"] != "usual_situation" else "before_moment"
    hijack = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={"question_id": other, "answer_id": "usual"},
        headers=auth_headers,
    )
    assert hijack.status_code == 422

    for index in range(3):
        shown = (
            await client.get(
                f"/v1/behavior/events/{event_id}/processing-context",
                headers=auth_headers,
            )
        ).json()["question"]
        assert shown is not None
        answered = await client.post(
            f"/v1/behavior/events/{event_id}/processing-context",
            json={
                "question_id": shown["id"],
                "answer_id": shown["options"][0]["id"],
            },
            headers=auth_headers,
        )
        assert answered.status_code == 200, answered.text
        assert answered.json()["accepting_answers"] is True
        if index == 2:
            assert answered.json()["question"] is None

    overflow = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={"question_id": "recent_change", "answer_id": "no"},
        headers=auth_headers,
    )
    assert overflow.status_code == 422


async def test_interpreting_cutoff_does_not_present_late_answer_as_applied(
    client: httpx.AsyncClient, auth_headers, state
):
    event_id = await _queue_event(client, auth_headers, "proc-cut-0001", state=state)
    shown = (
        await client.get(
            f"/v1/behavior/events/{event_id}/processing-context",
            headers=auth_headers,
        )
    ).json()["question"]
    state.store.behavior_events[event_id].status = BehaviorEventStatus.INTERPRETING
    hidden = await client.get(
        f"/v1/behavior/events/{event_id}/processing-context",
        headers=auth_headers,
    )
    assert hidden.json()["question"] is None
    assert hidden.json()["accepting_answers"] is False

    late = await client.post(
        f"/v1/behavior/events/{event_id}/processing-context",
        json={
            "question_id": shown["id"],
            "answer_id": shown["options"][0]["id"],
        },
        headers=auth_headers,
    )
    assert late.status_code == 200
    assert late.json()["applied_to_interpretation"] is False
    assert late.json()["accepting_answers"] is False
    assert late.json()["question"] is None
