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
    assert "confronto personale" in result.consumer_summary.lower()
    assert "solito" not in result.consumer_summary.lower()
    assert result.useful_action.key == "add_nutrition"
    assert result.useful_action.label == "Aggiungi"
    assert result.useful_action.title == "Alimentazione non impostata"
    assert result.useful_action.href == "/nutrition/foods"
    assert result.recommended_next_step
    assert result.recommended_next_step != result.useful_action.title
    assert "alimentazione" not in result.recommended_next_step.lower()


def test_watery_observation_asks_only_the_high_value_missing_question():
    result = build_digestive_intelligence(
        observation(consistency="watery"),
        context(active_food_name="Crocchette", quantity_per_day="200g", has_active_food=True),
    )

    assert result.followup_key == "vomiting_today"
    assert result.followup_question == "Rocky ha vomitato oggi?"
    assert result.useful_action.key == "ask_followup"
    assert {
        "VCA Animal Hospitals",
        "Journal of Small Animal Practice",
        "Purina Institute",
    }.issubset({item.publisher for item in result.knowledge_references})
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
    assert "solito" not in result.consumer_headline.lower()
    assert "confronto personale" in result.consumer_summary.lower()


def test_possible_foreign_material_does_not_dominate_the_result():
    result = build_digestive_intelligence(
        observation(foreign_material_candidate="possible", consistency="formed"),
        context(prior_scores=[4, 4, 4]),
    )
    assert result.overall_state is not DigestiveState.ATTENTION
    assert result.safety_state is DigestiveState.ROUTINE
    assert "FOREIGN_MATERIAL_CANDIDATE" not in {
        item["code"]
        for item in contextual_safety_flags(
            observation(foreign_material_candidate="possible"),
            context(prior_scores=[4, 4, 4]),
        )
    }


def test_clear_foreign_material_still_requires_attention():
    result = build_digestive_intelligence(
        observation(foreign_material_candidate="clear_candidate"),
        context(prior_scores=[4, 4, 4]),
    )
    assert result.overall_state is DigestiveState.ATTENTION
    assert result.safety_state is DigestiveState.ATTENTION


def test_same_photo_is_monitor_when_it_differs_from_personal_baseline():
    result = build_digestive_intelligence(
        observation(),
        context(prior_scores=[2, 2, 2, 2]),
    )

    assert result.overall_state is DigestiveState.MONITOR
    assert result.baseline_comparison == "ABOVE_USUAL"
    assert "morbide" in result.consumer_headline.lower()


def test_firmer_result_names_the_dog_and_explains_the_photo_naturally():
    result = build_digestive_intelligence(
        observation(
            consistency="formed",
            color="dark brown",
            fecal_score_estimate=3,
        ),
        context(prior_scores=[4, 4, 4, 4]),
    )

    assert result.consumer_headline == "Più compatte del suo solito"
    assert "ben formate" in " ".join(result.relevant_context)
    assert "marrone scuro" in " ".join(result.relevant_context)
    assert "appaiono" not in result.consumer_summary.lower()
    assert result.useful_action.key == "add_nutrition"


def test_recent_food_change_is_context_not_a_causal_claim():
    result = build_digestive_intelligence(
        observation(),
        context(
            prior_scores=[2, 2, 2],
            active_food_name="Royal Canin Labrador Adult",
            has_active_food=True,
            quantity_per_day="280g",
            food_started_days_ago=3,
        ),
    )

    assert result.possible_associations
    assert "3 giorni" in result.possible_associations[0]
    assert "3 giorni" in result.consumer_summary
    assert "causa" not in result.possible_associations[0].lower()
    assert "causa" not in result.consumer_summary.lower()
    assert any(
        item.publisher == "World Small Animal Veterinary Association"
        for item in result.knowledge_references
    )
    assert any(
        item.publisher == "American Animal Hospital Association"
        for item in result.knowledge_references
    )
    assert result.useful_action.key == "none"


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
    assert not any("causa" in item.lower() for item in result.possible_associations)


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
    assert not any("causa" in item.lower() for item in repeated.possible_associations)


def test_quality_warnings_do_not_leak_internal_codes():
    result = build_digestive_intelligence(
        observation(warnings=["filmed_screen", "audio_degraded"]),
        context(),
    )

    assert "filmed_screen" not in result.observation_reliability
    assert "audio_degraded" not in result.observation_reliability
    assert "SAFE_" not in result.consumer_headline
    assert "score" not in result.consumer_summary.lower()


def test_second_soft_observation_asks_one_natural_followup():
    result = build_digestive_intelligence(
        observation(consistency="watery"),
        context(recent_watery_count_24h=1, recent_episode_count_24h=1),
    )

    assert result.followup_key == "vomiting_today"
    assert result.followup_question == "Rocky ha vomitato oggi?"
    assert result.useful_action.key == "ask_followup"
    assert result.followup_question.count("?") == 1


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
    stored = state.store.fecal_events[event_id].intelligence_json
    assert stored["knowledge_registry_version"] == body["knowledge_registry_version"]
    assert stored["knowledge_registry_checksum"] == body["knowledge_registry_checksum"]
    assert stored["knowledge_claim_ids"] == body["knowledge_claim_ids"]
    assert body["knowledge_registry_version"] == "digestive-knowledge/v1"
    assert len(body["knowledge_registry_checksum"]) == 64
    assert body["knowledge_claim_ids"]

    contextualized = await client.patch(
        f"/v1/digestive/events/{event_id}/context",
        headers=auth_headers,
        json={"unusual_food_48h": True},
    )
    contextualized_body = contextualized.json()

    assert contextualized.status_code == 200
    assert contextualized_body["possible_associations"]
    assert "48 ore" in contextualized_body["possible_associations"][0]
    assert contextualized_body["useful_action"]["key"]


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
    assert body["image_quality"] == "sufficient"
    assert state.store.fecal_events[event_id].intelligence_json
    assert state.store.fecal_events[event_id].image_quality == "SUFFICIENT"


def test_missing_food_on_a_change_asks_to_add_nutrition():
    result = build_digestive_intelligence(
        observation(),
        context(prior_scores=[2, 2, 2, 2]),
    )
    assert result.baseline_comparison == "ABOVE_USUAL"
    assert result.useful_action.key == "add_nutrition"
    assert result.useful_action.label == "Aggiungi"
    assert result.useful_action.title == "Alimentazione non impostata"
    assert result.followup_key is None


def test_food_without_quantity_asks_only_for_that():
    result = build_digestive_intelligence(
        observation(),
        context(
            prior_scores=[2, 2, 2, 2],
            active_food_name="Royal Canin",
            has_active_food=True,
            active_food_product_id="food-abc",
        ),
    )
    assert result.useful_action.key == "complete_nutrition"
    assert result.useful_action.label == "Completa"
    assert result.useful_action.title == "Quantità non impostata"
    assert (
        result.useful_action.href
        == "/nutrition/foods/food-abc/verify?focus=quantity"
    )
    assert result.followup_key is None


def test_first_watery_without_food_asks_vomiting_before_nutrition():
    result = build_digestive_intelligence(
        observation(consistency="watery"),
        context(),
    )
    assert result.useful_action.key == "ask_followup"
    assert result.followup_key == "vomiting_today"
    assert result.followup_question == "Rocky ha vomitato oggi?"
    assert result.useful_action.key != "add_nutrition"


def test_verification_unavailable_keeps_controlled_caution():
    from app.domains.digestive_verification import apply_anomaly_verification

    result = build_digestive_intelligence(
        apply_anomaly_verification(
            observation(fresh_blood_candidate="possible"),
            {"fresh_blood_candidate": "verification_unavailable"},
        ),
        context(prior_scores=[4, 4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.MONITOR
    assert result.overall_state is DigestiveState.MONITOR
    assert result.overall_state is not DigestiveState.ROUTINE
    assert "confermare" in result.consumer_summary.lower()
    assert "sangue" not in result.consumer_summary.lower()
    assert "traccia rossa" in result.consumer_summary.lower()
    assert result.useful_action.key == "contact_vet"


def test_verification_unavailable_melena_does_not_mention_red_trace():
    from app.domains.digestive_verification import apply_anomaly_verification

    result = build_digestive_intelligence(
        apply_anomaly_verification(
            observation(melena_candidate="possible"),
            {"melena_candidate": "verification_unavailable"},
        ),
        context(prior_scores=[4, 4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.MONITOR
    assert "catramos" in result.consumer_summary.lower()
    assert "traccia rossa" not in result.consumer_summary.lower()
    assert "catramos" in (result.useful_action.body or "").lower()


def test_stable_routine_with_complete_nutrition_has_no_useful_cta():
    result = build_digestive_intelligence(
        observation(consistency="formed", fecal_score_estimate=4),
        context(
            prior_scores=[4, 4, 4, 4],
            active_food_name="Crocchette",
            has_active_food=True,
            quantity_per_day="200g",
        ),
    )
    assert result.overall_state is DigestiveState.ROUTINE
    assert result.useful_action.key == "none"
    assert result.followup_key is None


def test_safety_blocks_nutrition_cta():
    result = build_digestive_intelligence(
        observation(fresh_blood_candidate="clear_candidate"),
        context(prior_scores=[4, 4, 4, 4]),
    )
    assert result.useful_action.key == "contact_vet"
    assert result.followup_key is None


@pytest.mark.asyncio
async def test_verifier_technical_failure_is_unavailable_not_unknown():
    from app.worker.handlers import _verify_sensitive_anomalies

    class BoomVision:
        async def verify_anomaly_focus(self, *, image_ref, fields):
            del image_ref, fields
            raise TimeoutError

    class State:
        digestive_vision = BoomVision()
        cost_meter = None

    result = await _verify_sensitive_anomalies(
        State(),
        observation(fresh_blood_candidate="possible"),
        image_ref="https://example.test/stool.jpg",
        event_id="event-1",
        user_id="user-1",
    )
    stored = result["anomaly_verification"]["fresh_blood_candidate"]
    assert stored["verdict"] == "verification_unavailable"
    assert stored["verdict"] != "unknown"


def test_same_photo_means_different_things_with_different_personal_context():
    photo = observation(consistency="soft")
    softer = build_digestive_intelligence(photo, context(prior_scores=[2, 2, 2, 2]))
    usual = build_digestive_intelligence(photo, context(prior_scores=[4, 4, 4, 4]))
    assert softer.consumer_headline != usual.consumer_headline
    assert "morbide" in softer.consumer_headline.lower()
    assert "linea" in usual.consumer_headline.lower()
    assert "appaiono" not in softer.consumer_summary.lower()
    assert "appaiono" not in usual.consumer_summary.lower()


def test_repeated_event_changes_meaning_versus_isolated_episode():
    photo = observation(consistency="soft")
    isolated = build_digestive_intelligence(
        photo,
        context(prior_scores=[2, 2, 2, 2]),
    )
    repeated = build_digestive_intelligence(
        photo,
        context(prior_scores=[2, 2, 2, 2], episode_count_7d=1),
    )
    assert "seconda volta" not in isolated.consumer_summary.lower()
    assert "seconda volta" not in repeated.consumer_summary.lower()
    assert "altra volta" in repeated.consumer_summary.lower()
    assert isolated.consumer_headline == repeated.consumer_headline


def test_recent_event_counts_do_not_invent_a_second_time():
    photo = observation(consistency="soft")
    texts = []
    for count in (1, 2, 5):
        result = build_digestive_intelligence(
            photo,
            context(prior_scores=[2, 2, 2, 2], episode_count_7d=count),
        )
        blob = f"{result.consumer_headline} {result.consumer_summary} {result.recommended_next_step}".lower()
        texts.append((count, result.consumer_summary, blob))
        assert "seconda volta" not in blob
        assert "imparando" not in blob
    one, two, many = texts
    assert "altra volta" in one[1].lower()
    assert "si sta ripetendo" in two[1].lower()
    assert "si sta ripetendo" in many[1].lower()
    assert "altra volta" not in two[1].lower()
    assert "altra volta" not in many[1].lower()
    assert one[1] != two[1]
    assert two[1] == many[1]


def test_insufficient_baseline_does_not_mix_trend_with_pretend_usual():
    result = build_digestive_intelligence(
        observation(consistency="soft"),
        context(episode_count_7d=2),
    )
    blob = (
        f"{result.consumer_headline} {result.consumer_summary} "
        f"{result.recommended_next_step}"
    ).lower()
    assert result.baseline_comparison == "INSUFFICIENT"
    assert "si sta ripetendo" in result.consumer_summary.lower()
    assert "solito" not in blob
    assert "imparando" not in blob
    assert "osserva i prossimi episodi" in result.recommended_next_step.lower()


def test_routine_without_food_still_offers_brief_nutrition_cta():
    result = build_digestive_intelligence(
        observation(consistency="formed", fecal_score_estimate=4),
        context(prior_scores=[4, 4, 4, 4]),
    )
    assert result.overall_state is DigestiveState.ROUTINE
    assert result.useful_action.key == "add_nutrition"
    assert result.useful_action.title == "Alimentazione non impostata"
    assert result.useful_action.label == "Aggiungi"
    assert result.useful_action.body is None


def test_vomiting_true_selects_claim_unknown_and_false_do_not():
    watery = observation(consistency="watery")
    food = context(
        active_food_name="Crocchette",
        quantity_per_day="200g",
        has_active_food=True,
    )
    unknown = build_digestive_intelligence(watery, food)
    absent = build_digestive_intelligence(
        watery,
        context(
            active_food_name="Crocchette",
            quantity_per_day="200g",
            has_active_food=True,
            vomiting_today=False,
        ),
    )
    present = build_digestive_intelligence(
        watery,
        context(
            active_food_name="Crocchette",
            quantity_per_day="200g",
            has_active_food=True,
            vomiting_today=True,
        ),
    )
    assert unknown.useful_action.key == "ask_followup"
    assert "DIG_VOMITING_001" not in unknown.knowledge_claim_ids
    assert "DIG_VOMITING_001" not in absent.knowledge_claim_ids
    assert "DIG_VOMITING_001" in present.knowledge_claim_ids
    assert any(
        item.publisher == "Merck Veterinary Manual"
        for item in present.knowledge_references
    )
