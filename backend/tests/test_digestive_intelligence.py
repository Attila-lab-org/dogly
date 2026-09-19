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
    assert result.consumer_headline == "La digestione di Rocky è da osservare oggi"
    assert "andamento abituale" not in result.consumer_summary.lower()
    assert "solito" not in result.consumer_summary.lower()
    assert result.useful_action.key == "add_nutrition"
    assert result.useful_action.label == "Aggiungi"
    assert result.useful_action.title == "Cosa mangia Rocky?"
    assert result.useful_action.href == "/nutrition/foods"
    assert result.recommended_next_step
    assert result.recommended_next_step != result.useful_action.title
    assert "alimentazione" not in result.recommended_next_step.lower()
    assert "per ora va così" not in result.recommended_next_step.lower()


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
    assert result.consumer_headline == "Tutto regolare per Rocky"
    assert result.consumer_summary.count(".") <= 2
    assert "andamento abituale" not in result.consumer_summary.lower()
    assert "primo riferimento" not in result.consumer_headline.lower()
    assert "digerendo bene" in result.consumer_summary.lower()
    assert "routine" in result.consumer_summary.lower()
    assert "aggiungi" not in result.consumer_summary.lower()
    assert "questa foto" not in result.recommended_next_step.lower()
    assert "continua normalmente" in result.recommended_next_step.lower()


def test_general_layer_keeps_technical_scoring_out_of_owner_copy():
    result = build_digestive_intelligence(
        observation(
            consistency="formed",
            color="dark brown",
            fecal_score_estimate=3,
            confidence_band="HIGH",
            shape="log",
            apparent_moisture="normal",
            apparent_volume="normal",
        ),
        context(),
    )
    general = result.interpretation_layers[0].summary.lower()
    assert "consistenza ben formate" in general
    assert "colore marrone scuro" in general
    assert "anomalie visibili" in general
    assert "score" not in general
    assert "/7" not in general


def test_general_layer_stays_plain_language_when_confidence_is_not_high():
    result = build_digestive_intelligence(
        observation(
            consistency="formed",
            color="brown",
            fecal_score_estimate=3,
            confidence_band="MEDIUM",
            shape="log",
            apparent_moisture="normal",
            apparent_volume="normal",
        ),
        context(),
    )
    general = result.interpretation_layers[0].summary.lower()
    assert "consistenza ben formate" in general
    assert "colore marrone" in general
    assert "score" not in general


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
    assert (
        result.consumer_headline
        == "Le feci di Rocky sono più morbide rispetto al suo solito"
    )


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
        == "Le feci di Rocky sono ben formate rispetto al suo solito"
    )
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
    assert "continua normalmente" in result.recommended_next_step.lower()


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


def test_season_alone_never_produces_associations():
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
    assert not any("estate" in item for item in repeated.possible_associations)
    assert not any("stagion" in item.lower() for item in repeated.possible_associations)



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


def test_loose_stool_asks_appetite_after_vomiting_is_known_absent():
    result = build_digestive_intelligence(
        observation(consistency="unformed"),
        context(
            vomiting_today=False,
            active_food_name="Crocchette",
            quantity_per_day="200g",
            has_active_food=True,
        ),
    )
    assert result.followup_key == "appetite_reduced"
    assert result.followup_question == "Rocky ha mangiato meno del solito?"
    assert result.followup_question.count("?") == 1
    assert result.useful_action.key == "ask_followup"
    with_reduced_appetite = build_digestive_intelligence(
        observation(consistency="unformed"),
        context(vomiting_today=False, appetite_reduced=True),
    )
    assert with_reduced_appetite.safety_state is DigestiveState.ATTENTION


def test_hard_stool_asks_about_straining_before_nutrition():
    result = build_digestive_intelligence(
        observation(consistency="hard", fecal_score_estimate=2),
        context(),
    )
    assert result.followup_key == "straining_or_urgency"
    assert "sforzo o urgenza" in result.followup_question.lower()
    assert result.followup_question.count("?") == 1
    assert result.useful_action.key == "ask_followup"
    with_straining = build_digestive_intelligence(
        observation(consistency="hard", fecal_score_estimate=2),
        context(straining_or_urgency=True),
    )
    assert with_straining.safety_state is DigestiveState.ATTENTION


def test_visual_safety_keeps_precedence_over_context_followups():
    result = build_digestive_intelligence(
        observation(
            consistency="hard",
            fecal_score_estimate=2,
            fresh_blood_candidate="clear_candidate",
        ),
        context(),
    )
    assert result.useful_action.key == "contact_vet"
    assert result.followup_key is None
    assert result.followup_question is None


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


def test_confirmed_possible_blood_and_symptoms_align_flags_with_safety_state():
    from app.domains.digestive_verification import apply_anomaly_verification

    obs = apply_anomaly_verification(
        observation(
            consistency="unformed",
            fresh_blood_candidate="possible",
        ),
        {"fresh_blood_candidate": "confirmed"},
    )
    ctx = context(appetite_reduced=True)
    result = build_digestive_intelligence(obs, ctx)
    flags = contextual_safety_flags(obs, ctx)

    assert result.safety_state is DigestiveState.ATTENTION
    assert {"code": "BLOOD_CANDIDATE", "severity": "medium"} in flags
    assert {"code": "DIGESTIVE_SYMPTOMS", "severity": "medium"} in flags


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
    assert body["intelligence_schema_version"] == "digestive_intelligence.v2"
    assert body["overall_state"] in {"ROUTINE", "MONITOR", "ATTENTION", "VET_CONTACT"}
    assert body["consumer_headline"]
    assert "recommended_next_step" in body
    stored = state.store.fecal_events[event_id].intelligence_json
    assert stored["knowledge_registry_version"] == body["knowledge_registry_version"]
    assert stored["knowledge_registry_checksum"] == body["knowledge_registry_checksum"]
    assert stored["knowledge_claim_ids"] == body["knowledge_claim_ids"]
    assert body["knowledge_registry_version"] == "digestive-knowledge/v2"
    assert len(body["knowledge_registry_checksum"]) == 64
    assert body["knowledge_claim_ids"]

    feedback = await client.post(
        f"/v1/digestive/events/{event_id}/feedback",
        headers={**auth_headers, "X-Idempotency-Key": "digestive-v2-feedback"},
        json={"value": "YES"},
    )
    assert feedback.status_code == 200
    assert feedback.json()["value"] == "YES"
    assert state.store.digestive_feedback[event_id]["value"] == "YES"

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
    assert "recommended_next_step" in body
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
    assert result.useful_action.title == "Cosa mangia Rocky?"
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
    assert result.useful_action.title == "Quanti grammi al giorno?"
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
    assert result.consumer_headline == "La digestione di Rocky è da osservare oggi"
    assert "confermare" not in result.consumer_headline.lower()
    assert "confermare" not in result.consumer_summary.lower()
    assert "sangue" not in result.consumer_summary.lower()
    assert "traccia rossa" not in result.consumer_headline.lower()
    assert result.useful_action.key != "contact_vet"
    assert any("traccia rossa" in item.lower() for item in result.owner_advice)


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
    assert "catramos" in " ".join(result.owner_advice).lower()
    assert "traccia rossa" not in result.consumer_summary.lower()
    assert "confermare" not in result.consumer_summary.lower()
    assert result.useful_action.key != "contact_vet"


def test_unverified_possible_blood_does_not_replace_formed_result():
    from app.domains.digestive_verification import apply_anomaly_verification

    result = build_digestive_intelligence(
        apply_anomaly_verification(
            observation(
                consistency="formed",
                fecal_score_estimate=3,
                color="dark brown",
                color_family="DARK_BROWN",
                fresh_blood_candidate="possible",
            ),
            {"fresh_blood_candidate": "verification_unavailable"},
        ),
        context(appetite_reduced=True),
    )
    assert result.safety_state is DigestiveState.MONITOR
    assert result.overall_state is DigestiveState.MONITOR
    assert result.consumer_headline == "Il segnale di Rocky è l’appetito, non le feci"
    assert "confermare" not in result.consumer_headline.lower()
    assert "confermare" not in result.consumer_summary.lower()
    assert "mangiato meno" in result.consumer_summary.lower()
    assert "routine" in result.consumer_summary.lower()
    assert "questa foto" not in result.recommended_next_step.lower()
    assert "traccia rossa" not in result.consumer_summary.lower()
    assert "sangue" not in result.consumer_summary.lower()
    assert result.useful_action.key != "contact_vet"
    assert any("traccia rossa" in item.lower() for item in result.owner_advice)
    assert any("routine" in item.lower() or "mangiare" in item.lower() for item in result.owner_advice)
    personal = " ".join(
        layer.summary for layer in result.interpretation_layers if layer.key == "longitudinal"
    )
    assert "mangiato meno" in personal.lower()


def test_formed_stool_rules_out_food_and_season():
    result = build_digestive_intelligence(
        observation(
            consistency="formed",
            fecal_score_estimate=3,
            color="dark brown",
            color_family="DARK_BROWN",
        ),
        context(
            active_food_name="Royal Canin",
            has_active_food=True,
            quantity_per_day="200g",
            food_started_days_ago=40,
            season_label="autunno",
        ),
    )
    text = result.consumer_summary.lower()
    assert "non è l’alimento" in text or "non è l'alimento" in text
    assert "non è la stagione" in text
    assert "royal canin" in text
    assert "digerendo bene" in text
    assert any("digestione tiene" in item.lower() for item in result.owner_advice)
    assert not any("autunno" in item.lower() for item in result.possible_associations)


def test_loose_after_food_change_names_food_as_first_suspicion():
    result = build_digestive_intelligence(
        observation(consistency="soft"),
        context(
            prior_scores=[2, 2, 2],
            active_food_name="Royal Canin Labrador Adult",
            has_active_food=True,
            quantity_per_day="280g",
            food_started_days_ago=3,
        ),
    )
    text = result.consumer_summary.lower()
    assert "primo sospetto" in text
    assert "3 giorni" in text
    assert "royal canin" in text
    assert "causa" not in text
    assert "non cambiare di nuovo" in result.recommended_next_step.lower()


def test_loose_with_extras_prefers_indiscretion_over_usual_food():
    result = build_digestive_intelligence(
        observation(consistency="soft"),
        context(
            active_food_name="Crocchette",
            has_active_food=True,
            quantity_per_day="200g",
            food_started_days_ago=40,
            unusual_food_48h=True,
        ),
    )
    text = result.consumer_summary.lower()
    assert "mangiato di diverso" in text
    assert "primo sospetto" in text


def test_loose_stable_food_uses_season_as_next_check():
    result = build_digestive_intelligence(
        observation(consistency="soft"),
        context(
            active_food_name="Crocchette",
            has_active_food=True,
            quantity_per_day="200g",
            food_started_days_ago=40,
            season_label="estate",
        ),
    )
    text = result.consumer_summary.lower()
    assert "non è un cambio di alimento" in text
    assert "estate" in text
    assert "avanzi" in text
    assert result.consumer_summary.count(".") <= 2
    assert not any("estate" in item.lower() for item in result.possible_associations)


def test_formed_with_reduced_appetite_points_to_eating_not_stool():
    result = build_digestive_intelligence(
        observation(consistency="formed", fecal_score_estimate=3),
        context(appetite_reduced=True, season_label="estate"),
    )
    text = result.consumer_summary.lower()
    assert "mangiato meno" in text
    assert "non le feci" in text
    assert "routine" in text
    assert "appetito è il segnale" in result.recommended_next_step.lower()
    assert any("torna a mangiare" in item.lower() for item in result.owner_advice)


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
    assert (
        softer.consumer_headline
        == "Le feci di Rocky sono più morbide rispetto al suo solito"
    )
    assert (
        usual.consumer_headline
        == "Le feci di Rocky sono più morbide, in linea con il suo solito"
    )
    assert "appaiono" not in softer.consumer_summary.lower()
    assert "appaiono" not in usual.consumer_summary.lower()


def test_repeated_event_changes_meaning_versus_isolated_episode():
    photo = observation(consistency="soft")
    isolated = build_digestive_intelligence(
        photo,
        context(prior_scores=[2, 2, 2, 2], prior_consistencies=["formed", "formed"]),
    )
    repeated = build_digestive_intelligence(
        photo,
        context(
            prior_scores=[2, 2, 2, 2],
            prior_consistencies=["soft", "soft"],
        ),
    )
    assert "seconda volta" not in isolated.consumer_summary.lower()
    assert "seconda volta" not in repeated.consumer_summary.lower()
    assert (
        isolated.consumer_headline
        == "Le feci di Rocky sono più morbide rispetto al suo solito"
    )
    assert repeated.consumer_headline == "La digestione di Rocky non si è ancora stabilizzata"


def test_total_recent_analyses_are_not_a_soft_trend():
    photo = observation(consistency="soft")
    mixed = build_digestive_intelligence(
        photo,
        context(
            prior_scores=[3, 3, 3, 3],
            episode_count_7d=5,
            recent_episode_count_24h=5,
            prior_consistencies=["formed", "formed", "formed", "formed", "soft"],
        ),
    )
    blob = (
        f"{mixed.consumer_headline} {mixed.consumer_summary} "
        f"{mixed.recommended_next_step}"
    ).lower()
    assert "poche ore" not in blob
    assert mixed.consumer_headline != "Questo andamento si sta ripetendo"
    assert "già comparso" in mixed.consumer_summary.lower()
    repeated = build_digestive_intelligence(
        photo,
        context(
            prior_scores=[2, 2, 2, 2],
            prior_consistencies=["soft", "unformed", "soft"],
            episode_count_7d=3,
        ),
    )
    assert repeated.consumer_headline == "La digestione di Rocky non si è ancora stabilizzata"
    watery = build_digestive_intelligence(
        observation(consistency="watery"),
        context(
            active_food_name="Crocchette",
            quantity_per_day="200g",
            has_active_food=True,
            vomiting_today=False,
            prior_scores=[2, 2, 2, 2],
            recent_watery_count_24h=1,
            watery_count_7d=1,
            prior_consistencies=["watery"],
        ),
    )
    assert "ultime ore" in watery.consumer_summary.lower()
    assert watery.consumer_headline == "La digestione di Rocky non si è ancora stabilizzata"


def test_recent_event_counts_do_not_invent_a_second_time():
    photo = observation(consistency="soft")
    texts = []
    priors = {
        1: ["soft"],
        2: ["soft", "soft"],
        5: ["soft", "soft", "soft", "soft", "soft"],
    }
    for count in (1, 2, 5):
        result = build_digestive_intelligence(
            photo,
            context(prior_scores=[2, 2, 2, 2], prior_consistencies=priors[count]),
        )
        blob = f"{result.consumer_headline} {result.consumer_summary} {result.recommended_next_step}".lower()
        texts.append((count, result.consumer_headline, result.consumer_summary, blob))
        assert "seconda volta" not in blob
        assert "imparando" not in blob
        assert "poche ore" not in blob
    one, two, many = texts
    assert one[1] == "Le feci di Rocky sono più morbide rispetto al suo solito"
    assert two[1] == "La digestione di Rocky non si è ancora stabilizzata"
    assert many[1] == "La digestione di Rocky non si è ancora stabilizzata"
    assert "già comparso" in one[2].lower()
    assert "non si è ancora stabilizzata" in two[1].lower()
    assert one[2] != two[2]


def test_insufficient_baseline_does_not_mix_trend_with_pretend_usual():
    result = build_digestive_intelligence(
        observation(consistency="soft"),
        context(prior_consistencies=["soft", "soft"]),
    )
    blob = (
        f"{result.consumer_headline} {result.consumer_summary} "
        f"{result.recommended_next_step}"
    ).lower()
    assert result.baseline_comparison == "INSUFFICIENT"
    assert result.consumer_headline == "La digestione di Rocky non si è ancora stabilizzata"
    assert "solito" not in blob
    assert "imparando" not in blob
    assert "osserva i prossimi episodi" not in blob
    assert "per ora va così" not in blob
    assert "da tenere d" not in blob
    assert "non cambiare quantità" in result.recommended_next_step.lower()


def test_routine_without_food_still_offers_brief_nutrition_cta():
    result = build_digestive_intelligence(
        observation(consistency="formed", fecal_score_estimate=4),
        context(prior_scores=[4, 4, 4, 4]),
    )
    assert result.overall_state is DigestiveState.ROUTINE
    assert result.useful_action.key == "add_nutrition"
    assert result.useful_action.title == "Cosa mangia Rocky?"
    assert result.useful_action.label == "Aggiungi"
    assert result.useful_action.body


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


def _blob(result) -> str:
    return (
        f"{result.consumer_headline} {result.consumer_summary} "
        f"{result.recommended_next_step}"
    ).lower()


def test_formed_regular_speaks_as_expert_not_as_the_app():
    result = build_digestive_intelligence(
        observation(consistency="formed", fecal_score_estimate=3),
        context(dog_name="Oreo"),
    )
    blob = _blob(result)
    assert result.overall_state is DigestiveState.ROUTINE
    assert result.consumer_headline == "Tutto regolare per Oreo"
    assert "oreo sta digerendo bene" in result.consumer_summary.lower()
    assert "aggiungi" not in result.consumer_summary.lower()
    assert "letture" not in blob
    assert "foto" not in blob
    assert result.recommended_next_step == "Continua normalmente."
    assert result.useful_action.title == "Cosa mangia Oreo?"
    assert "razione è giusta" in (result.useful_action.body or "").lower()


def test_formed_unverified_without_symptoms_stays_regular():
    from app.domains.digestive_verification import apply_anomaly_verification

    result = build_digestive_intelligence(
        apply_anomaly_verification(
            observation(
                consistency="formed",
                fecal_score_estimate=3,
                fresh_blood_candidate="possible",
            ),
            {"fresh_blood_candidate": "verification_unavailable"},
        ),
        context(dog_name="Oreo"),
    )
    assert result.overall_state is DigestiveState.ROUTINE
    assert result.safety_state is DigestiveState.ROUTINE
    assert result.consumer_headline == "Tutto regolare per Oreo"
    assert "foto" not in _blob(result)
    assert any("traccia rossa" in item.lower() for item in result.owner_advice)


def test_possible_mucus_is_contextualized_not_an_alarm():
    result = build_digestive_intelligence(
        observation(mucus_candidate="possible"),
        context(prior_scores=[4, 4, 4, 4]),
    )
    blob = _blob(result)
    assert result.overall_state is not DigestiveState.ATTENTION
    assert result.overall_state is not DigestiveState.VET_CONTACT
    assert "vischioso" not in result.consumer_summary.lower()
    assert "muco" not in blob
    assert any("muco" in item.lower() for item in result.relevant_context)
    assert "colite" not in blob
    assert "da tenere d" not in blob
    assert (
        result.consumer_headline
        == "Le feci di Rocky sono più morbide, in linea con il suo solito"
    )


def test_oreo_like_soft_repeat_answers_meaning_why_and_next_step():
    result = build_digestive_intelligence(
        observation(mucus_candidate="possible", consistency="soft"),
        context(dog_name="Oreo", prior_consistencies=["soft", "soft"]),
    )
    blob = _blob(result)
    assert result.consumer_headline == "La digestione di Oreo non si è ancora stabilizzata"
    assert "oreo" in result.consumer_headline.lower()
    assert "non si è ancora stabilizzata" in result.consumer_headline.lower()
    assert result.consumer_summary.count(".") <= 2
    assert "muco" not in blob
    assert "possibile muco" not in blob
    assert any("non è abbastanza" in item.lower() for item in result.relevant_context)
    assert "non cambiare quantità" in result.recommended_next_step.lower()
    assert "foto" not in result.recommended_next_step.lower()


def test_same_photo_changes_with_food_history_and_symptoms():
    photo = observation(consistency="soft")
    first = build_digestive_intelligence(photo, context())
    repeating = build_digestive_intelligence(
        photo,
        context(prior_consistencies=["soft", "soft"]),
    )
    new_food = build_digestive_intelligence(
        photo,
        context(
            prior_scores=[2, 2, 2, 2],
            active_food_name="Salmone",
            has_active_food=True,
            quantity_per_day="200g",
            food_started_days_ago=3,
        ),
    )
    stable_food = build_digestive_intelligence(
        photo,
        context(
            prior_scores=[2, 2, 2, 2],
            active_food_name="Salmone",
            has_active_food=True,
            quantity_per_day="200g",
            food_started_days_ago=90,
        ),
    )
    with_vomiting = build_digestive_intelligence(
        photo,
        context(
            prior_scores=[2, 2, 2, 2],
            active_food_name="Salmone",
            has_active_food=True,
            quantity_per_day="200g",
            vomiting_today=True,
        ),
    )
    usual = build_digestive_intelligence(
        photo,
        context(
            prior_scores=[4, 4, 4, 4],
            active_food_name="Salmone",
            has_active_food=True,
            quantity_per_day="200g",
            food_started_days_ago=90,
        ),
    )
    assert first.consumer_headline == "La digestione di Rocky è da osservare oggi"
    assert "andamento abituale" not in first.consumer_summary.lower()
    assert repeating.consumer_headline == "La digestione di Rocky non si è ancora stabilizzata"
    assert "3 giorni" in new_food.consumer_summary
    assert "causa" not in new_food.consumer_summary.lower()
    assert new_food.consumer_summary != stable_food.consumer_summary
    assert "vomitato" in with_vomiting.consumer_summary.lower()
    assert "veterinario" in with_vomiting.recommended_next_step.lower()
    assert (
        usual.consumer_headline
        == "Le feci di Rocky sono più morbide, in linea con il suo solito"
    )
    assert "nulla di urgente" in usual.recommended_next_step.lower()
    assert first.recommended_next_step != repeating.recommended_next_step
    assert repeating.recommended_next_step != with_vomiting.recommended_next_step
    for result in (first, repeating, new_food, stable_food, usual):
        blob = _blob(result)
        assert "per ora va così" not in blob
        assert "osserva i prossimi episodi" not in blob
        assert "da tenere d" not in blob
        assert "appaiono" not in result.consumer_summary.lower()

def _layers(result):
    return {layer.key: layer for layer in result.interpretation_layers}


def test_first_photo_is_useful_without_personal_baseline():
    result = build_digestive_intelligence(observation(), context())
    layers = _layers(result)

    assert "general" in layers
    assert "longitudinal" not in layers
    assert layers["general"].summary
    assert result.consumer_headline == "La digestione di Rocky è da osservare oggi"
    assert result.baseline_comparison == "INSUFFICIENT"
    assert result.recommended_next_step
    assert result.useful_action.key


def test_large_vs_small_changes_only_profile_layer():
    obs = observation()
    large = build_digestive_intelligence(obs, context(size="large"))
    small = build_digestive_intelligence(obs, context(size="small"))

    assert large.overall_state == small.overall_state
    assert large.safety_state == small.safety_state
    assert large.baseline_comparison == small.baseline_comparison
    assert "profile" in _layers(large)
    assert "profile" not in _layers(small)
    assert "size" in _layers(large)["profile"].factors_used
    assert "DIG_SIZE_CONTEXT_001" in large.knowledge_claim_ids
    assert "DIG_SIZE_CONTEXT_001" not in small.knowledge_claim_ids


def test_puppy_vs_adult_changes_only_when_age_claim_applies():
    obs = observation()
    puppy = build_digestive_intelligence(obs, context(age_stage="PUPPY"))
    adult = build_digestive_intelligence(obs, context(age_stage="ADULT"))

    assert puppy.overall_state == adult.overall_state
    assert puppy.safety_state == adult.safety_state
    assert "profile" in _layers(puppy)
    assert "profile" not in _layers(adult)
    assert "age_stage" in _layers(puppy)["profile"].factors_used
    assert "DIG_AGE_STAGE_CONTEXT_001" in puppy.knowledge_claim_ids
    assert "DIG_AGE_STAGE_CONTEXT_001" not in adult.knowledge_claim_ids


def test_labrador_vs_mix_does_not_introduce_breed_prior():
    obs = observation()
    lab = build_digestive_intelligence(
        obs, context(breed_label="Labrador Retriever", size="large")
    )
    mix = build_digestive_intelligence(
        obs, context(breed_label="Mix", size="large")
    )

    assert lab.consumer_headline == mix.consumer_headline
    assert lab.consumer_summary == mix.consumer_summary
    assert lab.knowledge_claim_ids == mix.knowledge_claim_ids
    assert [layer.key for layer in lab.interpretation_layers] == [
        layer.key for layer in mix.interpretation_layers
    ]
    assert not any("breed" in layer.factors_used for layer in lab.interpretation_layers)
    assert not any(claim.startswith("DIG_BREED") for claim in lab.knowledge_claim_ids)


def test_absolute_weight_does_not_change_meaning_but_delta_does():
    obs = observation()
    absolute = build_digestive_intelligence(obs, context(weight_kg=32.0))
    delta = build_digestive_intelligence(
        obs,
        context(weight_kg=32.0, latest_weight_kg=30.5, weight_delta_kg=-1.5),
    )
    bare = build_digestive_intelligence(obs, context())

    assert absolute.consumer_summary == bare.consumer_summary
    assert [layer.key for layer in absolute.interpretation_layers] == [
        layer.key for layer in bare.interpretation_layers
    ]
    assert "DIG_WEIGHT_CONTEXT_001" not in absolute.knowledge_claim_ids
    assert "profile" in _layers(delta)
    assert "weight_delta" in _layers(delta)["profile"].factors_used
    assert "DIG_WEIGHT_CONTEXT_001" in delta.knowledge_claim_ids


def test_baseline_and_repetition_add_longitudinal_precision():
    obs = observation(consistency="soft", fecal_score_estimate=5)
    with_baseline = build_digestive_intelligence(
        obs,
        context(
            prior_scores=[2, 2, 2, 2],
            prior_consistencies=["formed", "formed", "formed", "formed"],
        ),
    )
    with_repetition = build_digestive_intelligence(
        obs,
        context(
            prior_scores=[5, 5],
            prior_consistencies=["soft", "soft"],
        ),
    )
    first = build_digestive_intelligence(obs, context())

    assert "longitudinal" not in _layers(first)
    assert "longitudinal" in _layers(with_baseline)
    assert "personal_baseline" in _layers(with_baseline)["longitudinal"].factors_used
    assert "longitudinal" in _layers(with_repetition)
    assert "semantic_repetition" in _layers(with_repetition)["longitudinal"].factors_used


def test_api_model_exposes_interpretation_layers():
    result = build_digestive_intelligence(
        observation(),
        context(age_stage="PUPPY", size="large"),
    )
    assert result.interpretation_layers
    assert result.interpretation_layers[0].key == "general"
    assert any(layer.key == "profile" for layer in result.interpretation_layers)
    dumped = result.model_dump(mode="json")
    assert "interpretation_layers" in dumped
    assert dumped["schema_version"] == "digestive_intelligence.v2"
    assert dumped["knowledge_registry_version"] == "digestive-knowledge/v2"

