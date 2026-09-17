"""Digestive Intelligence V2 decision gates."""

import pytest

from app.domains.digestive import contextual_safety_flags
from app.domains.digestive_intelligence import (
    DigestiveContext,
    DigestiveState,
    build_digestive_intelligence,
)
from app.worker.handlers import process_digestive_event
from tests.conftest import create_dog


def observation(**updates):
    value = {
        "image_quality": "sufficient",
        "warnings": [],
        "fecal_score_estimate": 4,
        "consistency": "soft",
        "fresh_blood_candidate": "none_observed",
        "melena_candidate": "none_observed",
        "foreign_material_candidate": "none_observed",
    }
    value.update(updates)
    return value


def context(**updates):
    value = {"dog_name": "Rocky"}
    value.update(updates)
    return DigestiveContext(**value)


def test_new_dog_monitors_without_inventing_a_baseline():
    result = build_digestive_intelligence(observation(), context())

    assert result.overall_state is DigestiveState.MONITOR
    assert result.baseline_comparison == "INSUFFICIENT"
    assert "costruendo" in result.consumer_summary


def test_watery_observation_asks_only_the_high_value_missing_question():
    result = build_digestive_intelligence(
        observation(consistency="watery"), context()
    )

    assert result.followup_key == "vomiting_today"
    assert result.followup_question == "Rocky ha vomitato oggi?"
    assert {item.publisher for item in result.knowledge_references} == {
        "Merck Veterinary Manual",
        "VCA Animal Hospitals",
        "Journal of Small Animal Practice",
    }
    assert "REPEATED_WATERY" not in {
        item["code"]
        for item in contextual_safety_flags(
            observation(consistency="watery"),
            context(),
        )
    }


def test_same_photo_is_routine_when_it_matches_personal_baseline():
    result = build_digestive_intelligence(
        observation(consistency="formed"),
        context(prior_scores=[4, 4, 4, 4]),
    )

    assert result.overall_state is DigestiveState.ROUTINE
    assert result.baseline_comparison == "NEAR_USUAL"


def test_first_formed_photo_does_not_claim_similarity_to_usual():
    result = build_digestive_intelligence(
        observation(consistency="formed", fecal_score_estimate=3),
        context(),
    )

    assert result.baseline_comparison == "INSUFFICIENT"
    assert "simili al solito" not in result.consumer_headline
    assert "servono ancora" in result.consumer_summary.lower()


def test_possible_foreign_material_requires_attention():
    result = build_digestive_intelligence(
        observation(foreign_material_candidate="possible"),
        context(prior_scores=[4, 4, 4]),
    )
    assert result.overall_state is DigestiveState.ATTENTION


def test_same_photo_is_monitor_when_it_differs_from_personal_baseline():
    result = build_digestive_intelligence(
        observation(),
        context(prior_scores=[2, 2, 2, 2]),
    )

    assert result.overall_state is DigestiveState.MONITOR
    assert result.baseline_comparison == "ABOVE_USUAL"
    assert "più morbide" in result.consumer_headline


def test_firmer_result_names_the_dog_and_explains_the_photo_naturally():
    result = build_digestive_intelligence(
        observation(
            consistency="formed",
            color="dark brown",
            fecal_score_estimate=3,
        ),
        context(prior_scores=[4, 4, 4, 4]),
    )

    assert (
        result.consumer_headline
        == "Le feci di Rocky sembrano più compatte del suo solito"
    )
    assert "ben formata" in result.consumer_summary
    assert "marrone scuro" in result.consumer_summary
    assert "per ora non serve cambiare nulla" in result.recommended_next_step


def test_recent_food_change_is_context_not_a_causal_claim():
    result = build_digestive_intelligence(
        observation(),
        context(
            prior_scores=[2, 2, 2],
            active_food_name="Royal Canin Labrador Adult",
            food_started_days_ago=3,
        ),
    )

    assert result.possible_associations
    assert "non dimostra" in result.possible_associations[0]
    assert any(
        item.publisher == "World Small Animal Veterinary Association"
        for item in result.knowledge_references
    )
    assert any(
        item.publisher == "American Animal Hospital Association"
        for item in result.knowledge_references
    )
    assert "gradualmente" in result.recommended_next_step


def test_missing_active_food_never_becomes_a_food_change_today():
    result = build_digestive_intelligence(
        observation(consistency="formed", fecal_score_estimate=3),
        context(food_started_days_ago=0),
    )

    assert result.possible_associations == []
    assert "cambio" not in result.recommended_next_step.lower()


def test_repeated_food_association_requires_both_periods_and_stays_cautious():
    result = build_digestive_intelligence(
        observation(fecal_score_estimate=5),
        context(
            prior_scores=[2, 2, 2, 5, 5],
            active_food_name="Salmone",
            current_food_prior_scores=[5, 5],
            previous_food_scores=[2, 2, 2],
        ),
    )

    assert any("Salmone" in item for item in result.possible_associations)
    assert any(
        "non dimostra" in item for item in result.possible_associations
    )


def test_season_is_not_mentioned_until_there_are_repeated_comparisons():
    sparse = build_digestive_intelligence(
        observation(fecal_score_estimate=5),
        context(
            season_label="estate",
            same_season_prior_scores=[5],
            other_season_scores=[2, 2, 2],
        ),
    )
    repeated = build_digestive_intelligence(
        observation(fecal_score_estimate=5),
        context(
            season_label="estate",
            same_season_prior_scores=[5, 5],
            other_season_scores=[2, 2, 2],
        ),
    )

    assert not any("estate" in item for item in sparse.possible_associations)
    assert any("estate" in item for item in repeated.possible_associations)
    assert any("non una causa" in item for item in repeated.possible_associations)


def test_clear_blood_candidate_cannot_be_downgraded_by_baseline():
    result = build_digestive_intelligence(
        observation(fresh_blood_candidate="clear_candidate"),
        context(prior_scores=[4, 4, 4, 4]),
    )

    assert result.overall_state is DigestiveState.VET_CONTACT
    assert result.safety_state is DigestiveState.VET_CONTACT
    assert "veterinario" in result.recommended_next_step


def test_owner_confirmed_symptoms_and_foreign_material_have_fixed_flags():
    flags = contextual_safety_flags(
        observation(
            consistency="watery",
            foreign_material_candidate="clear_candidate",
        ),
        context(
            recent_episode_count_24h=2,
            recent_watery_count_24h=1,
            vomiting_today=True,
        ),
    )

    assert {flag["code"] for flag in flags} >= {
        "FOREIGN_MATERIAL_CANDIDATE",
        "REPEATED_WATERY",
        "DIGESTIVE_SYMPTOMS",
    }


@pytest.mark.asyncio
async def test_completed_event_exposes_backward_compatible_v2_result(
    client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    init = await client.post(
        "/v1/digestive/fecal/init",
        headers={**auth_headers, "X-Idempotency-Key": "digestive-v2-init"},
        json={
            "dog_id": dog_id,
            "client_request_id": "digestive-v2-event",
            "bytes": 1_000,
            "content_type": "image/jpeg",
        },
    )
    event_id = init.json()["event_id"]
    path = init.json()["upload"]["storage_path"]
    state.storage.objects.add(("digestive-raw", path))
    await client.post(
        f"/v1/digestive/fecal/{event_id}/complete",
        headers={**auth_headers, "X-Idempotency-Key": "digestive-v2-complete"},
    )

    completed = await process_digestive_event(state, event_id=event_id)
    response = await client.get(
        f"/v1/digestive/events/{event_id}", headers=auth_headers
    )
    body = response.json()

    assert completed["status"] == "COMPLETED"
    assert response.status_code == 200
    assert body["fecal_score_estimate"] is not None
    assert body["intelligence_schema_version"] == "digestive_intelligence.v1"
    assert body["overall_state"] in {"ROUTINE", "MONITOR", "ATTENTION", "VET_CONTACT"}
    assert body["consumer_headline"]
    assert body["recommended_next_step"]

    contextualized = await client.patch(
        f"/v1/digestive/events/{event_id}/context",
        headers=auth_headers,
        json={"unusual_food_48h": True},
    )
    contextualized_body = contextualized.json()

    assert contextualized.status_code == 200
    assert contextualized_body["possible_associations"]
    assert "non una causa accertata" in contextualized_body[
        "possible_associations"
    ][0]


@pytest.mark.asyncio
async def test_get_rebuilds_missing_intelligence_for_completed_events(
    client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    init = await client.post(
        "/v1/digestive/fecal/init",
        headers={**auth_headers, "X-Idempotency-Key": "digestive-legacy-init"},
        json={
            "dog_id": dog_id,
            "client_request_id": "digestive-legacy-event",
            "bytes": 1_000,
            "content_type": "image/jpeg",
        },
    )
    event_id = init.json()["event_id"]
    path = init.json()["upload"]["storage_path"]
    state.storage.objects.add(("digestive-raw", path))
    await client.post(
        f"/v1/digestive/fecal/{event_id}/complete",
        headers={**auth_headers, "X-Idempotency-Key": "digestive-legacy-complete"},
    )
    await process_digestive_event(state, event_id=event_id)
    state.store.fecal_events[event_id].intelligence_json = None

    response = await client.get(
        f"/v1/digestive/events/{event_id}", headers=auth_headers
    )
    body = response.json()

    assert response.status_code == 200
    assert body["consumer_headline"]
    assert body["recommended_next_step"]
    assert state.store.fecal_events[event_id].intelligence_json
