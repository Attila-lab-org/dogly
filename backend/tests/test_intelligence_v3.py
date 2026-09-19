"""Intelligence V3: mix/unknown, resolver, context, digestive windows, OPFF."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest

from app.config import Settings
from app.contracts.api import ExternalFoodConfirmRequest, ExternalFoodLookupRequest
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ContextBucket
from app.domains.digestive_intelligence import (
    DigestiveContext,
    DigestiveState,
    build_digestive_intelligence,
)
from app.domains.dog_context import build_dog_context
from app.domains.external_food import confirm_external_food, lookup_external_food
from app.domains.intelligence_context import build_dog_intelligence_context
from app.domains.models import DogRec, FoodProductRec
from app.knowledge.breed_resolver import resolve_breed
from app.knowledge.intelligence_v3 import get_intelligence_v3, select_claims
from app.knowledge.retrieval import breed_prior_eligible, retrieve_evidence
from app.providers.mock import load_fixture
from app.providers.open_pet_food_facts import (
    ExternalFoodCandidate,
    OpenPetFoodFactsClient,
)
from app.worker.handlers import process_behavior_event


def _settings(**overrides) -> Settings:
    return Settings(
        app_env="local",
        job_queue_backend="fake",
        worker_internal_token="t",
        **overrides,
    )


def _dog(**overrides) -> DogRec:
    return DogRec(
        id="dog-1",
        owner_id="user-1",
        name="Luna",
        created_at=datetime.now(UTC),
        **overrides,
    )


def test_mix_and_unknown_never_receive_breed_prior():
    raw = load_fixture("observation.fixture.json")
    raw["body"]["rigidity_candidate"] = "yes"
    observation = ObservationContract.model_validate(raw)
    for dog in (
        _dog(breed_label="Mix", is_mix=True),
        _dog(breed_label="Mix"),
        _dog(breed_label="meticcio"),
        _dog(breed_label="Sconosciuto"),
        _dog(breed_label="razza inventata xyz"),
        _dog(breed_label=None),
    ):
        context = build_dog_context(dog)
        assert breed_prior_eligible(context) is False
        result = retrieve_evidence(observation, ContextBucket.HOME, context)
        assert "PRIOR_BREED_001" not in {card.card_id for card in result.cards}


def test_named_breed_still_receives_existing_prior():
    from app.knowledge.retrieval import _candidate_ids

    observation = ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "mock",
                "model": "mock",
                "request_id": "req-breed",
            },
            "capture_quality": {"overall_quality": "good"},
        }
    )
    context = build_dog_context(_dog(breed_label="Labrador Retriever"))
    assert breed_prior_eligible(context) is True
    assert "PRIOR_BREED_001" in _candidate_ids(
        observation, ContextBucket.UNKNOWN, context
    )
    result = retrieve_evidence(observation, ContextBucket.UNKNOWN, context)
    assert "PRIOR_BREED_001" in {card.card_id for card in result.cards}


@pytest.mark.parametrize(
    ("label", "is_mix", "status", "group"),
    [
        ("Labrador Retriever", False, "NAMED", "RETRIEVING"),
        ("labrador", False, "NAMED", "RETRIEVING"),
        ("Pastore Tedesco", False, "NAMED", "HERDING"),
        ("Mix", True, "MIX", "MIX"),
        ("meticcio", False, "MIX", "MIX"),
        (None, False, "UNKNOWN", "UNKNOWN"),
        ("razza inventata xyz", False, "UNKNOWN", "UNKNOWN"),
    ],
)
def test_breed_resolver(label, is_mix, status, group):
    resolved = resolve_breed(label, is_mix=is_mix)
    assert resolved.status == status
    assert resolved.functional_group == group
    assert resolved.prior_eligible is (status == "NAMED")


def test_unrecognized_breed_is_unknown_and_gets_no_named_prior():
    from app.knowledge.retrieval import _candidate_ids

    observation = ObservationContract.model_validate(
        {
            "observer_meta": {
                "provider": "mock",
                "model": "mock",
                "request_id": "req-unknown-breed",
            },
            "capture_quality": {"overall_quality": "good"},
        }
    )
    resolved = resolve_breed("razza inventata xyz")
    context = build_dog_context(_dog(breed_label="razza inventata xyz"))
    assert resolved.status == "UNKNOWN"
    assert resolved.prior_eligible is False
    assert breed_prior_eligible(context) is False
    assert "PRIOR_BREED_001" not in _candidate_ids(
        observation, ContextBucket.UNKNOWN, context
    )
    result = retrieve_evidence(observation, ContextBucket.UNKNOWN, context)
    assert "PRIOR_BREED_001" not in {card.card_id for card in result.cards}


def test_flagged_claims_require_their_feature_flag():
    off = {
        "breed_intelligence_v1": False,
        "morphology_observer_context_v1": False,
        "nutrition_intelligence_v1": False,
        "digestive_longitudinal_v3": False,
        "open_pet_food_facts_v1": False,
    }
    digestive_off = {
        claim.claim_id
        for claim in select_claims(
            domain="digestive",
            flags=off,
            extra_when=[],
            limit=20,
        )
    }
    assert "DIGEST_LONGITUDINAL_001" not in digestive_off
    assert "NUTR_TRANSITION_001" not in digestive_off
    assert "POP_NO_AGGRESSION_001" in digestive_off

    digestive_on = {
        claim.claim_id
        for claim in select_claims(
            domain="digestive",
            flags={**off, "digestive_longitudinal_v3": True},
            extra_when=[],
            limit=20,
        )
    }
    assert "DIGEST_LONGITUDINAL_001" in digestive_on

    nutrition_off = {
        claim.claim_id
        for claim in select_claims(domain="nutrition", flags=off, limit=20)
    }
    assert "NUTR_WEIGHT_001" not in nutrition_off
    assert "OPFF_ATTRIBUTION_001" not in nutrition_off

    nutrition_on = {
        claim.claim_id
        for claim in select_claims(
            domain="nutrition",
            flags={**off, "nutrition_intelligence_v1": True},
            limit=20,
        )
    }
    assert "NUTR_WEIGHT_001" in nutrition_on
    assert "OPFF_ATTRIBUTION_001" not in nutrition_on

    behavior_off = {
        claim.claim_id
        for claim in select_claims(
            domain="behavior",
            flags=off,
            extra_when=["named_breed"],
            limit=20,
        )
    }
    assert "POP_VARIATION_001" not in behavior_off
    assert "MORPH_VERIFY_001" not in behavior_off

    intel = build_dog_intelligence_context(
        _dog(breed_label="Luna mix", is_mix=False),
        domain="digestive",
        settings=_settings(),
    )
    assert "DIGEST_LONGITUDINAL_001" not in {claim.claim_id for claim in intel.claims}


def test_dog_identity_reaches_context_and_reasoner_payload():
    dog = _dog(
        sex="MALE",
        size="LARGE",
        breed_label="Labrador Retriever",
    ).model_copy(update={"name": "Rocky"})
    context = build_dog_context(dog, owner_display_name="  Attila  ")
    assert context.name == "Rocky"
    assert context.sex == "MALE"
    assert context.size == "LARGE"
    assert context.breed_label == "Labrador Retriever"
    assert context.owner_display_name == "Attila"

    intel = build_dog_intelligence_context(
        dog,
        context,
        domain="behavior",
        settings=_settings(breed_intelligence_v1=True),
    )
    identity = intel.reasoner_payload()["identity"]
    assert identity == {
        "name": "Rocky",
        "sex": "MALE",
        "age_months": context.age_months,
        "size": "LARGE",
        "breed": "Labrador Retriever",
        "owner_display_name": "Attila",
    }
    assert "identity facts, not behavioral verdicts" in " ".join(
        intel.reasoner_payload()["rules"]
    )


def test_observer_payload_never_includes_breed_name():
    intel = build_dog_intelligence_context(
        _dog(breed_label="Greyhound"),
        domain="behavior",
        settings=_settings(morphology_observer_context_v1=True),
    )
    payload = intel.observer_payload()
    assert payload is not None
    blob = " ".join(payload.values()).lower()
    assert "greyhound" not in blob
    assert "breed" not in blob


def test_population_claims_stay_behind_flag():
    off = build_dog_intelligence_context(
        _dog(breed_label="Border Collie"),
        domain="behavior",
        settings=_settings(),
    )
    on = build_dog_intelligence_context(
        _dog(breed_label="Border Collie"),
        domain="behavior",
        settings=_settings(breed_intelligence_v1=True),
    )
    assert "POP_VARIATION_001" not in {claim.claim_id for claim in off.claims}
    assert "POP_NO_AGGRESSION_001" in {claim.claim_id for claim in off.claims}
    assert "POP_VARIATION_001" in {claim.claim_id for claim in on.claims}


def test_intelligence_registry_validates():
    document = get_intelligence_v3()
    assert document.version == "3.0"
    assert document.claims


def test_digestive_longitudinal_is_frequency_not_diagnosis():
    result = build_digestive_intelligence(
        {
            "image_quality": "sufficient",
            "warnings": [],
            "fecal_score_estimate": 6,
            "consistency": "watery",
            "fresh_blood_candidate": "none_observed",
            "melena_candidate": "none_observed",
            "foreign_material_candidate": "none_observed",
        },
        DigestiveContext(
            dog_name="Rocky",
            episode_count_7d=4,
            watery_count_7d=2,
            weight_delta_kg=-1.4,
        ),
        longitudinal=True,
    )
    text = " ".join(result.possible_associations).lower()
    assert "7 giorni" in text
    assert "diagnosi" not in text
    assert result.overall_state in {
        DigestiveState.MONITOR,
        DigestiveState.ATTENTION,
        DigestiveState.VET_CONTACT,
    }


@pytest.mark.asyncio
async def test_opff_lookup_requires_flag(
    client: httpx.AsyncClient, auth_headers: dict[str, str]
):
    created = await client.post(
        "/v1/dogs", json={"name": "Rocky"}, headers=auth_headers
    )
    dog_id = created.json()["id"]
    response = await client.post(
        "/v1/nutrition/foods/external/lookup",
        json={
            "dog_id": dog_id,
            "barcode": "3017620422003",
            "client_request_id": "opff-flag-1",
        },
        headers={**auth_headers, "X-Idempotency-Key": "opff-flag-1"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_opff_search_lists_confirmable_foods(
    client: httpx.AsyncClient, auth_headers: dict[str, str], state
):
    state.settings.open_pet_food_facts_v1 = True
    from app.contracts.api import ExternalFoodSearchRequest
    from app.domains.external_food import search_external_foods
    from app.providers.open_pet_food_facts import ExternalFoodCandidate

    created = await client.post(
        "/v1/dogs", json={"name": "Rocky"}, headers=auth_headers
    )
    dog_id = created.json()["id"]
    user_id = state.store.dogs[dog_id].owner_id

    class SearchClient(OpenPetFoodFactsClient):
        async def search_products(self, query: str, *, limit: int = 12):
            assert "salmone" in query
            return [
                ExternalFoodCandidate(
                    barcode="8000000000001",
                    name="Salmone con Riso",
                    brand="Acme",
                )
            ]

    hits = await search_external_foods(
        state.store,
        user_id=user_id,
        payload=ExternalFoodSearchRequest(
            dog_id=dog_id,
            query="salmone riso",
            client_request_id="opff-search-1",
        ),
        enabled=True,
        client=SearchClient(),
    )
    assert hits[0][1].name == "Salmone con Riso"
    assert hits[0][0] in state.store.external_food_lookups


@pytest.mark.asyncio
async def test_weight_events_and_opff_memory_path(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
    state,
):
    state.settings.open_pet_food_facts_v1 = True
    created = await client.post(
        "/v1/dogs",
        json={"name": "Rocky", "weight_kg": 12.0},
        headers=auth_headers,
    )
    dog_id = created.json()["id"]
    created_weight = await client.post(
        f"/v1/dogs/{dog_id}/weight-events",
        json={"weight_kg": 11.2, "body_condition_score": 4},
        headers=auth_headers,
    )
    assert created_weight.status_code == 201, created_weight.text
    listed = await client.get(f"/v1/dogs/{dog_id}/weight-events", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()[0]["weight_kg"] == 11.2

    class FakeClient(OpenPetFoodFactsClient):
        async def lookup_barcode(self, barcode: str):
            return ExternalFoodCandidate(
                barcode="".join(ch for ch in barcode if ch.isdigit()),
                provider_code=barcode,
                name="Crocchette prova",
                brand="Acme",
                ingredients_raw="pollo, riso",
                calories="350 kcal/100g",
            )

    user_id = state.store.dogs[dog_id].owner_id
    lookup_id, candidate = await lookup_external_food(
        state.store,
        user_id=user_id,
        payload=ExternalFoodLookupRequest(
            dog_id=dog_id,
            barcode="8000000000000",
            client_request_id="opff-ok-2",
        ),
        enabled=True,
        client=FakeClient(),
    )
    assert candidate.confirmation_required is True
    product = confirm_external_food(
        state.store,
        user_id=user_id,
        payload=ExternalFoodConfirmRequest(
            dog_id=dog_id,
            lookup_id=lookup_id,
            brand="Acme",
            name="Crocchette prova",
        ),
        enabled=True,
    )
    assert product.verified_at is not None
    assert product.barcode == "8000000000000"
    assert product.external_source == "open_pet_food_facts"
    assert product.ingredients_raw == "pollo, riso"
    assert product.guaranteed_analysis["calories"] == "350 kcal/100g"

    draft_id = "photo-draft"
    state.store.food_products[draft_id] = FoodProductRec(
        id=draft_id,
        owner_id=user_id,
        dog_id=dog_id,
        image_path="users/test/food.jpg",
        guaranteed_analysis={"crude_protein_min": 24.0},
    )
    draft_lookup_id, _ = await lookup_external_food(
        state.store,
        user_id=user_id,
        payload=ExternalFoodLookupRequest(
            dog_id=dog_id,
            barcode="8000000000001",
            client_request_id="opff-photo-1",
        ),
        enabled=True,
        client=FakeClient(),
    )
    from_photo = confirm_external_food(
        state.store,
        user_id=user_id,
        payload=ExternalFoodConfirmRequest(
            dog_id=dog_id,
            lookup_id=draft_lookup_id,
            draft_food_id=draft_id,
            brand="Acme",
            name="Crocchette prova",
        ),
        enabled=True,
    )
    assert from_photo.id == draft_id
    assert from_photo.image_path == "users/test/food.jpg"
    assert from_photo.guaranteed_analysis["crude_protein_min"] == 24.0
    assert from_photo.guaranteed_analysis["calories"] == "350 kcal/100g"


@pytest.mark.asyncio
async def test_behavior_audit_records_mix_resolution(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
    state,
):
    created = await client.post(
        "/v1/dogs",
        json={"name": "Rocky", "breed_label": "Mix", "is_mix": True},
        headers=auth_headers,
    )
    dog_id = created.json()["id"]
    init = await client.post(
        "/v1/behavior/captures/init",
        json={
            "dog_id": dog_id,
            "client_request_id": "intel-mix-1",
            "duration_ms": 8000,
            "has_audio": True,
            "bytes": 1_000_000,
            "content_type": "video/mp4",
            "context_bucket": "HOME",
        },
        headers={**auth_headers, "X-Idempotency-Key": "intel-mix-1"},
    )
    assert init.status_code == 200, init.text
    capture_id = init.json()["capture_id"]
    event_id = init.json()["event_id"]
    complete = await client.post(
        f"/v1/behavior/captures/{capture_id}/complete",
        headers=auth_headers,
    )
    assert complete.status_code == 200, complete.text
    await process_behavior_event(state, event_id=event_id)
    event = state.store.behavior_events[event_id]
    audit = (event.interpretation_json or {}).get("intelligence_audit") or {}
    assert audit.get("breed_status") == "MIX"
    assert audit.get("prior_eligible") is False
