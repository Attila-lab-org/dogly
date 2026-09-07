"""Acceptance tests for Dogly Knowledge + Advice Engine V2."""

from __future__ import annotations

from datetime import UTC, date, datetime

import httpx

from app.contracts.interpretation import (
    EvidenceItem,
    InterpretationContract,
    SafetyFlag,
)
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ConfidenceBand, ContextBucket, IntentCode
from app.domains.dog_context import build_dog_context, derive_life_stage
from app.domains.models import DogRec
from app.knowledge.advice import build_advice
from app.knowledge.models import (
    DogContextSnapshot,
    KnowledgeContext,
    LifeStageContext,
)
from app.knowledge.registry import EXPECTED_VERSION, get_registry
from app.knowledge.retrieval import retrieve_evidence
from app.providers.mock import load_fixture


def _dog(**overrides) -> DogRec:
    return DogRec(
        id="dog-1",
        owner_id="user-1",
        name="Luna",
        created_at=datetime.now(UTC),
        **overrides,
    )


def _interpretation(
    intent: IntentCode,
    *,
    flags: list[SafetyFlag] | None = None,
) -> InterpretationContract:
    evidence = [
        EvidenceItem(source="observation", description=f"evidence {index}")
        for index in range(3)
    ]
    return InterpretationContract(
        primary_intent=intent,
        confidence_band=ConfidenceBand.MEDIUM,
        consumer_summary="Possibile interpretazione prudente.",
        evidence=evidence,
        safety_flags=flags or [],
    )


def test_registry_is_validated_and_versioned():
    registry = get_registry()
    assert registry.metadata["version"] == EXPECTED_VERSION
    assert len(registry.base_knowledge_cards) >= 30
    assert len(registry.advice_catalog) >= 7


def test_known_observation_retrieves_bounded_scientific_cards():
    raw = load_fixture("observation.fixture.json")
    raw["body"]["rigidity_candidate"] = "yes"
    raw["tail"]["movement"] = "wagging"
    observation = ObservationContract.model_validate(raw)
    context = build_dog_context(_dog(breed_label="Mix"))

    result = retrieve_evidence(observation, ContextBucket.HOME, context)

    ids = {card.card_id for card in result.cards}
    assert "OBS_BODY_002" in ids
    assert "OBS_TAIL_003" in ids
    assert len(result.cards) <= 6


def test_no_matching_card_has_low_coverage():
    observation = ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "mock",
                "model": "mock",
                "request_id": "req-1",
            },
            "capture_quality": {"overall_quality": "good"},
        }
    )
    result = retrieve_evidence(
        observation,
        ContextBucket.UNKNOWN,
        build_dog_context(_dog()),
    )
    assert result.coverage == "LOW"
    assert result.cards == []


def test_life_stage_derivation_and_unknown_fallback():
    months, puppy = derive_life_stage(
        _dog(birth_date="2026-03-01", size="MEDIUM"),
        today=date(2026, 9, 6),
    )
    assert months == 6
    assert puppy.value == "PUPPY"
    assert puppy.source == "DERIVED"

    months, unknown = derive_life_stage(_dog(), today=date(2026, 9, 6))
    assert months is None
    assert unknown.value == "UNKNOWN"


def test_owner_reported_provenance_is_preserved():
    context = build_dog_context(
        _dog(),
        {
            "routine": {"sleep_pattern": "irregular"},
            "provenance": {"sleep_pattern": "OWNER_REPORTED"},
        },
    )
    assert context.routine["sleep_pattern"] is not None
    assert context.routine["sleep_pattern"].provenance == "OWNER_REPORTED"


async def test_lifestyle_api_is_owner_scoped(
    client: httpx.AsyncClient, auth_headers, rsa_keys
):
    dog = await client.post("/v1/dogs", headers=auth_headers, json={"name": "Luna"})
    dog_id = dog.json()["id"]
    updated = await client.patch(
        f"/v1/dogs/{dog_id}/lifestyle",
        headers=auth_headers,
        json={
            "routine": {"sleep": "REGULAR"},
            "provenance": {"sleep": "OWNER_REPORTED"},
            "confirm": True,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["routine"]["sleep"] == "REGULAR"
    assert updated.json()["last_confirmed_at"] is not None

    from tests.conftest import make_token

    other = {"Authorization": f"Bearer {make_token(rsa_keys[0])}"}
    denied = await client.get(f"/v1/dogs/{dog_id}/lifestyle", headers=other)
    assert denied.status_code == 404


def test_urgent_safety_suppresses_training_and_enrichment():
    context = build_dog_context(_dog(age_stage="ADULT"))
    knowledge = KnowledgeContext(registry_version="2.0", coverage="LOW")
    advice = build_advice(
        _interpretation(
            IntentCode.HIGH_AROUSAL,
            flags=[SafetyFlag(code="IMMEDIATE_DANGER", severity="urgent")],
        ),
        context,
        knowledge,
    )
    assert advice is None


def test_puppy_advice_never_forces_exposure():
    context = DogContextSnapshot(
        dog_id="dog-1",
        life_stage=LifeStageContext(
            value="PUPPY", source="DERIVED", confidence="MEDIUM"
        ),
    )
    advice = build_advice(
        _interpretation(IntentCode.FEAR_INSECURITY),
        context,
        KnowledgeContext(registry_version="2.0", coverage="MEDIUM"),
    )
    assert advice is not None
    assert "force" in advice.action.lower()
    assert len([advice]) == 1


def test_senior_recent_change_selects_vet_escalation():
    context = build_dog_context(
        _dog(age_stage="SENIOR"),
        {
            "routine": {"recent_changes": {"sleep_change": "new"}},
            "provenance": {"sleep_change": "OWNER_REPORTED"},
        },
    )
    advice = build_advice(
        _interpretation(IntentCode.RELAX_REST),
        context,
        KnowledgeContext(registry_version="2.0", coverage="MEDIUM"),
    )
    assert advice is not None
    assert advice.code == "ADVICE_SENIOR_CHANGE_VET"


async def test_worker_persists_catalog_advice_and_owner_can_record_outcome(
    client: httpx.AsyncClient,
    worker_client: httpx.AsyncClient,
    auth_headers,
    rsa_keys,
):
    dog = await client.post(
        "/v1/dogs",
        headers=auth_headers,
        json={"name": "Luna", "age_stage": "ADULT"},
    )
    assert dog.status_code == 201
    dog_id = dog.json()["id"]
    init = await client.post(
        "/v1/behavior/captures/init",
        headers={**auth_headers, "X-Idempotency-Key": "advice-init"},
        json={
            "dog_id": dog_id,
            "client_request_id": "advice-crid",
            "duration_ms": 8_000,
            "bytes": 1_000,
            "content_type": "video/mp4",
            "context_bucket": "HOME",
        },
    )
    capture_id = init.json()["capture_id"]
    event_id = init.json()["event_id"]
    complete = await client.post(
        f"/v1/behavior/captures/{capture_id}/complete",
        headers={**auth_headers, "X-Idempotency-Key": "advice-complete"},
    )
    assert complete.status_code == 200
    processed = await worker_client.post(
        "/tasks/run",
        headers={"x-internal-token": "test-internal-token"},
        json={"task_type": "behavior_analysis", "event_id": event_id},
    )
    assert processed.json()["status"] == "COMPLETED"
    notification = await worker_client.post(
        "/tasks/run",
        headers={"x-internal-token": "test-internal-token"},
        json={
            "task_type": "behavior_result_notification",
            "event_id": event_id,
        },
    )
    assert notification.status_code == 200
    assert notification.json()["devices"] == 0

    event = await client.get(f"/v1/behavior/events/{event_id}", headers=auth_headers)
    advice = event.json()["advice"]
    assert advice is not None
    assert advice["code"] in {item.code for item in get_registry().advice_catalog}

    outcome = await client.post(
        f"/v1/behavior/events/{event_id}/advice-outcome",
        headers=auth_headers,
        json={"advice_code": advice["code"], "outcome": "HELPED"},
    )
    assert outcome.status_code == 201, outcome.text
    assert outcome.json()["outcome"] == "HELPED"
    refreshed = await client.get(
        f"/v1/behavior/events/{event_id}", headers=auth_headers
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["advice_outcome"] == "HELPED"

    from tests.conftest import make_token

    other = {"Authorization": f"Bearer {make_token(rsa_keys[0])}"}
    denied = await client.post(
        f"/v1/behavior/events/{event_id}/advice-outcome",
        headers=other,
        json={"advice_code": advice["code"], "outcome": "HELPED"},
    )
    assert denied.status_code == 404
