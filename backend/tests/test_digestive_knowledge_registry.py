"""Dedicated Digestive Knowledge Registry V1: schema, retrieval, forbidden use."""

from __future__ import annotations

from app.domains.digestive_intelligence import (
    DigestiveContext,
    DigestiveState,
    build_digestive_intelligence,
)
from app.domains.digestive_observation import (
    derive_fecal_score,
    is_learning_eligible,
    prepare_digestive_observation,
)
from app.knowledge.digestive import (
    retrieve_digestive_knowledge as retrieve_from_observation,
)
from app.knowledge.digestive_registry import (
    EXPECTED_VERSION,
    GUIDANCE_ONLY_STATUS,
    document_checksum,
    get_digestive_knowledge,
    matcher_claim_ids,
)


def _obs(**updates):
    value = {
        "image_quality": "sufficient",
        "warnings": [],
        "fecal_score_estimate": 4,
        "consistency": "soft",
        "shape": "piled",
        "apparent_moisture": "normal",
        "segmentation": "present",
        "color": "brown",
        "confidence_band": "MEDIUM",
        "mucus_candidate": "none_observed",
        "fresh_blood_candidate": "none_observed",
        "melena_candidate": "none_observed",
        "foreign_material_candidate": "none_observed",
        "undigested_food_candidate": "none_observed",
    }
    value.update(updates)
    return value


def _consumer_text(result) -> str:
    return " ".join(
        [
            result.consumer_headline,
            result.consumer_summary,
            result.recommended_next_step,
            result.observation_reliability or "",
            *result.relevant_context,
            *result.possible_associations,
            result.useful_action.body or "",
        ]
    ).lower()


def test_registry_version_checksum_and_unique_ids():
    document = get_digestive_knowledge()
    assert document.version == EXPECTED_VERSION
    checksum = document_checksum()
    assert len(checksum) == 64
    assert checksum == document_checksum()
    assert len({source.id for source in document.sources}) == len(document.sources)
    assert len({claim.id for claim in document.claims}) == len(document.claims)
    source_ids = {source.id for source in document.sources}
    for claim in document.claims:
        assert claim.source_ids
        assert set(claim.source_ids) <= source_ids


def test_every_claim_has_a_deterministic_matcher():
    document = get_digestive_knowledge()
    assert {claim.id for claim in document.claims} == set(matcher_claim_ids())


def test_guidance_only_transition_is_documented_not_retrieved():
    claim = get_digestive_knowledge().claim_map()["DIG_DIET_TRANSITION_001"]
    assert claim.status == GUIDANCE_ONLY_STATUS
    retrieval = retrieve_from_observation(
        prepare_digestive_observation(_obs()),
        state="MONITOR",
        safety_state="ROUTINE",
        has_food_context=True,
        quantity_present=True,
        food_started_days_ago=3,
        prior_score_count=3,
        owner_context_used=True,
    )
    assert "DIG_DIET_TRANSITION_001" not in retrieval.claim_ids
    assert retrieval.registry_version == EXPECTED_VERSION
    assert retrieval.checksum == document_checksum()
    inactive = [
        item.id
        for item in get_digestive_knowledge().claims
        if item.status != "active_v1"
    ]
    assert inactive == ["DIG_DIET_TRANSITION_001"]


def test_score_1_to_7_comes_from_visible_primitives_only():
    mapping = [
        (
            1,
            {
                "consistency": "hard",
                "apparent_moisture": "low",
                "segmentation": "present",
                "shape": "pellets",
            },
        ),
        (
            2,
            {
                "consistency": "formed",
                "apparent_moisture": "low",
                "segmentation": "present",
                "shape": "log",
            },
        ),
        (
            3,
            {
                "consistency": "formed",
                "apparent_moisture": "normal",
                "segmentation": "reduced",
                "shape": "log",
            },
        ),
        (
            4,
            {
                "consistency": "soft",
                "apparent_moisture": "normal",
                "segmentation": "present",
                "shape": "log",
            },
        ),
        (
            5,
            {
                "consistency": "soft",
                "apparent_moisture": "high",
                "segmentation": "reduced",
                "shape": "piled",
            },
        ),
        (6, {"consistency": "unformed", "shape": "none"}),
        (7, {"consistency": "watery", "shape": "puddle"}),
    ]
    for expected, fields in mapping:
        score, source = derive_fecal_score(
            _obs(
                fecal_score_estimate=None,
                effort_to_pass="straining",
                pickup_residue="high",
                odor="strong",
                **fields,
            )
        )
        assert score == expected
        assert source == "derived"


def test_shape_changes_fecal_score_when_other_primitives_are_equal():
    formed_high = {
        "consistency": "formed",
        "apparent_moisture": "high",
        "segmentation": "reduced",
        "fecal_score_estimate": None,
        "image_quality": "sufficient",
    }
    log_score, log_source = derive_fecal_score({**formed_high, "shape": "log"})
    piled_score, piled_source = derive_fecal_score({**formed_high, "shape": "piled"})
    assert log_source == piled_source == "derived"
    assert log_score == 4
    assert piled_score == 5

    hard_dry = {
        "consistency": "hard",
        "apparent_moisture": "low",
        "segmentation": "present",
        "fecal_score_estimate": None,
        "image_quality": "sufficient",
    }
    pellets, _ = derive_fecal_score({**hard_dry, "shape": "pellets"})
    log, _ = derive_fecal_score({**hard_dry, "shape": "log"})
    assert pellets == 1
    assert log == 2

    soft_high = {
        "consistency": "soft",
        "apparent_moisture": "high",
        "segmentation": "reduced",
        "fecal_score_estimate": None,
        "image_quality": "sufficient",
    }
    soft_log, _ = derive_fecal_score({**soft_high, "shape": "log"})
    soft_piled, _ = derive_fecal_score({**soft_high, "shape": "piled"})
    assert soft_log == 4
    assert soft_piled == 5


def test_nonvisual_purina_criteria_are_not_inferred():
    score, _ = derive_fecal_score(
        _obs(
            consistency="formed",
            apparent_moisture="normal",
            segmentation="reduced",
            fecal_score_estimate=None,
            effort_to_pass="difficult",
            pickup_residue="leaves residue",
        )
    )
    assert score == 3
    prepared = prepare_digestive_observation(
        _obs(consistency="watery", effort_to_pass="easy", pickup_residue="none")
    )
    assert prepared["fecal_score_estimate"] == 7
    assert prepared["fecal_score_source"] == "derived"


def test_ordinary_yellow_color_is_not_a_diagnosis():
    result = build_digestive_intelligence(
        _obs(color="yellow", consistency="formed", fecal_score_estimate=3),
        DigestiveContext(dog_name="Rocky", prior_scores=[3, 3, 3]),
    )
    text = _consumer_text(result)
    assert "giallo" in text
    assert "DIG_COLOR_NONRED_NONBLACK_001" in result.knowledge_claim_ids
    for banned in (
        "fegato",
        "pancreas",
        "ittero",
        "infezione",
        "diagnosi",
        "colite",
        "cads",
    ):
        assert banned not in text


def test_possible_blood_is_verified_not_treated_as_clear():
    possible = build_digestive_intelligence(
        _obs(fresh_blood_candidate="possible"),
        DigestiveContext(dog_name="Rocky", prior_scores=[4, 4, 4]),
    )
    clear = build_digestive_intelligence(
        _obs(fresh_blood_candidate="clear_candidate"),
        DigestiveContext(dog_name="Rocky", prior_scores=[4, 4, 4]),
    )
    assert "DIG_FRESH_BLOOD_POSSIBLE_001" in possible.knowledge_claim_ids
    assert "DIG_FRESH_BLOOD_001" not in possible.knowledge_claim_ids
    assert possible.overall_state is not DigestiveState.VET_CONTACT
    assert "DIG_FRESH_BLOOD_001" in clear.knowledge_claim_ids
    assert "DIG_FRESH_BLOOD_POSSIBLE_001" not in clear.knowledge_claim_ids
    assert clear.overall_state is DigestiveState.VET_CONTACT
    assert "colite" not in _consumer_text(clear)


def test_possible_melena_is_not_clear_tarry_safety():
    possible = build_digestive_intelligence(
        _obs(melena_candidate="possible"),
        DigestiveContext(dog_name="Rocky", prior_scores=[4, 4, 4]),
    )
    clear = build_digestive_intelligence(
        _obs(melena_candidate="clear_candidate"),
        DigestiveContext(dog_name="Rocky", prior_scores=[4, 4, 4]),
    )
    assert "DIG_BLACK_TARRY_POSSIBLE_001" in possible.knowledge_claim_ids
    assert "DIG_BLACK_TARRY_001" not in possible.knowledge_claim_ids
    assert possible.overall_state is not DigestiveState.VET_CONTACT
    assert "DIG_BLACK_TARRY_001" in clear.knowledge_claim_ids
    assert clear.overall_state is DigestiveState.VET_CONTACT


def test_foreign_material_is_not_obstruction():
    possible = build_digestive_intelligence(
        _obs(foreign_material_candidate="possible", consistency="formed"),
        DigestiveContext(dog_name="Rocky", prior_scores=[4, 4, 4]),
    )
    clear = build_digestive_intelligence(
        _obs(foreign_material_candidate="clear_candidate"),
        DigestiveContext(dog_name="Rocky", prior_scores=[4, 4, 4]),
    )
    assert "DIG_FOREIGN_POSSIBLE_001" in possible.knowledge_claim_ids
    assert "DIG_FOREIGN_MATERIAL_001" not in possible.knowledge_claim_ids
    assert possible.overall_state is not DigestiveState.ATTENTION
    assert "ostruzione" not in _consumer_text(possible)
    assert "DIG_FOREIGN_MATERIAL_001" in clear.knowledge_claim_ids
    assert clear.overall_state is DigestiveState.ATTENTION
    assert "ostruzione" not in _consumer_text(clear)
    assert "indurre" not in _consumer_text(clear)


def test_recent_food_change_retrieves_association_not_causality():
    result = build_digestive_intelligence(
        _obs(),
        DigestiveContext(
            dog_name="Rocky",
            prior_scores=[2, 2, 2],
            active_food_name="Royal Canin Labrador Adult",
            has_active_food=True,
            quantity_per_day="280g",
            food_started_days_ago=3,
        ),
    )
    assert "DIG_FOOD_CHANGE_001" in result.knowledge_claim_ids
    assert "DIG_DIET_TRANSITION_001" not in result.knowledge_claim_ids
    assert any(
        item.publisher == "American Animal Hospital Association"
        for item in result.knowledge_references
    )
    assert any(
        item.publisher == "World Small Animal Veterinary Association"
        for item in result.knowledge_references
    )
    assert "causa" not in _consumer_text(result)


def test_insufficient_and_safety_events_do_not_teach_baseline():
    insufficient = prepare_digestive_observation(
        _obs(image_quality="insufficient", fecal_score_estimate=None)
    )
    safety = prepare_digestive_observation(_obs(fresh_blood_candidate="clear_candidate"))
    assert insufficient["learning_eligible"] is False
    assert is_learning_eligible(insufficient) is False
    assert safety["display_eligible"] is True
    assert safety["learning_eligible"] is False
    insufficient_result = build_digestive_intelligence(
        _obs(image_quality="insufficient", fecal_score_estimate=None),
        DigestiveContext(dog_name="Rocky"),
    )
    safety_result = build_digestive_intelligence(
        _obs(fresh_blood_candidate="clear_candidate"),
        DigestiveContext(dog_name="Rocky", prior_scores=[4, 4, 4]),
    )
    assert "DIG_LEARNING_QUALITY_001" in insufficient_result.knowledge_claim_ids
    assert "DIG_LEARNING_SAFETY_001" in safety_result.knowledge_claim_ids


def test_watery_retrieval_is_deterministic_and_bounded():
    context = DigestiveContext(
        dog_name="Rocky",
        active_food_name="Crocchette",
        quantity_per_day="200g",
        has_active_food=True,
    )
    first = build_digestive_intelligence(_obs(consistency="watery"), context)
    second = build_digestive_intelligence(_obs(consistency="watery"), context)
    assert first.knowledge_claim_ids == second.knowledge_claim_ids
    assert [item.reference_id for item in first.knowledge_references] == [
        item.reference_id for item in second.knowledge_references
    ]
    assert "DIG_SCORE_7_001" in first.knowledge_claim_ids
    assert "DIG_VOMITING_001" not in first.knowledge_claim_ids
    assert "cads" not in _consumer_text(first)
    assert {
        "VCA Animal Hospitals",
        "Journal of Small Animal Practice",
        "Purina Institute",
    }.issubset({item.publisher for item in first.knowledge_references})


def test_repeated_watery_and_missing_quantity_match_activation_cards():
    watery = retrieve_from_observation(
        prepare_digestive_observation(_obs(consistency="watery")),
        state="ATTENTION",
        safety_state="ATTENTION",
        recent_watery_count_24h=1,
        recent_episode_count_24h=1,
    )
    assert "DIG_REPEATED_WATERY_001" in watery.claim_ids
    amount = retrieve_from_observation(
        prepare_digestive_observation(_obs()),
        state="MONITOR",
        safety_state="ROUTINE",
        has_food_context=True,
        quantity_present=False,
    )
    assert "DIG_FEEDING_AMOUNT_001" in amount.claim_ids
    assert "DIG_DIET_HISTORY_001" in amount.claim_ids
