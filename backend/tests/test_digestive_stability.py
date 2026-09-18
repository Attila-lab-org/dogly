"""Stability, gating, cache scope, and learning eligibility for digestive."""

from __future__ import annotations

from app.contracts.taxonomy import STOOL_OBSERVATION_SCHEMA_VERSION
from app.domains.digestive import deterministic_safety_flags
from app.domains.digestive_eval import compare_repeated, evaluate_observation
from app.domains.digestive_intelligence import (
    DigestiveContext,
    DigestiveState,
    build_digestive_intelligence,
)
from app.domains.digestive_observation import (
    DIGESTIVE_NORMALIZER_VERSION,
    DIGESTIVE_OBSERVER_PROMPT_VERSION,
    ColorFamily,
    canonicalize_color,
    derive_fecal_score,
    is_learning_eligible,
    prepare_digestive_observation,
)
from app.domains.digestive_observation_cache import (
    engine_identity,
    image_sha256,
    lookup_cached_observation,
    store_cached_observation,
)
from app.domains.digestive_verification import safety_candidate
from app.domains.repository import InMemoryStore


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
    }
    value.update(updates)
    return value


def test_same_input_normalizes_identically():
    first = prepare_digestive_observation(_obs(color="green-brown"))
    second = prepare_digestive_observation(_obs(color="green-brown"))
    assert first["color_family"] == second["color_family"]
    assert first["fecal_score_estimate"] == second["fecal_score_estimate"]
    assert first["safety_candidates"] == second["safety_candidates"]


def test_green_brown_variants_share_a_family():
    families = {
        canonicalize_color(item)
        for item in (
            "green-brown",
            "brown-green",
            "olive-brown",
            "olive_green",
            "olive brown",
            "GREEN_BROWN",
        )
    }
    assert families == {ColorFamily.GREEN_BROWN}


def test_soft_stool_does_not_flicker_between_four_and_five():
    four, _ = derive_fecal_score(_obs(fecal_score_estimate=4, consistency="soft"))
    five_model, _ = derive_fecal_score(_obs(fecal_score_estimate=5, consistency="soft"))
    assert four == 4
    assert five_model == 4
    lost_shape, _ = derive_fecal_score(
        _obs(
            consistency="soft",
            apparent_moisture="high",
            segmentation="reduced",
        )
    )
    assert lost_shape == 5


def test_possible_foreign_is_not_treated_as_certainty():
    prepared = prepare_digestive_observation(
        _obs(foreign_material_candidate="possible")
    )
    assert safety_candidate(prepared, "foreign_material_candidate") == "possible_unverified"
    assert "FOREIGN_MATERIAL_CANDIDATE" not in {
        item["code"] for item in deterministic_safety_flags(prepared)
    }
    result = build_digestive_intelligence(
        prepared,
        DigestiveContext(dog_name="Oreo", prior_scores=[4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.ROUTINE
    assert "FOREIGN_MATERIAL" not in result.consumer_headline
    assert "possible" not in result.consumer_summary.lower()


def test_none_observed_is_not_clinical_absence():
    prepared = prepare_digestive_observation(_obs())
    assert prepared["foreign_material_candidate"] == "none_observed"
    summary = build_digestive_intelligence(
        prepared, DigestiveContext(dog_name="Oreo")
    ).consumer_summary
    assert "assenza" not in summary.lower()
    assert "provata" not in summary.lower()
    assert "nessun materiale estraneo" not in summary.lower()


def test_clear_candidate_is_never_lowered_by_gating_or_copy():
    prepared = prepare_digestive_observation(
        _obs(fresh_blood_candidate="clear_candidate")
    )
    assert safety_candidate(prepared, "fresh_blood_candidate") == "clear_candidate"
    result = build_digestive_intelligence(
        prepared,
        DigestiveContext(dog_name="Oreo", prior_scores=[4, 4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.VET_CONTACT
    assert result.overall_state is DigestiveState.VET_CONTACT
    assert "veterinario" in result.recommended_next_step


def test_insufficient_photo_is_not_learning_eligible():
    prepared = prepare_digestive_observation(
        _obs(image_quality="insufficient", fecal_score_estimate=None)
    )
    assert prepared["display_eligible"] is False
    assert prepared["learning_eligible"] is False
    assert is_learning_eligible(prepared) is False


def test_unstable_possible_candidate_is_not_learning_eligible():
    prepared = prepare_digestive_observation(
        _obs(foreign_material_candidate="possible")
    )
    assert prepared["display_eligible"] is True
    assert prepared["learning_eligible"] is False


def test_clean_observation_is_learning_eligible():
    prepared = prepare_digestive_observation(_obs())
    assert prepared["learning_eligible"] is True


def test_cache_does_not_cross_user_or_dog_boundary():
    store = InMemoryStore()
    digest = image_sha256(b"identical-oreo-stool")
    identity = engine_identity(provider="openai", model="gpt-5-mini")
    observation = prepare_digestive_observation(_obs())
    store_cached_observation(
        store,
        user_id="user-a",
        dog_id="dog-oreo",
        image_sha256_hex=digest,
        identity=identity,
        observation=observation,
        source_event_id="event-1",
    )
    assert (
        lookup_cached_observation(
            store,
            user_id="user-b",
            dog_id="dog-oreo",
            image_sha256_hex=digest,
            identity=identity,
        )
        is None
    )
    assert (
        lookup_cached_observation(
            store,
            user_id="user-a",
            dog_id="dog-other",
            image_sha256_hex=digest,
            identity=identity,
        )
        is None
    )
    assert lookup_cached_observation(
        store,
        user_id="user-a",
        dog_id="dog-oreo",
        image_sha256_hex=digest,
        identity=identity,
    )["color_family"] == ColorFamily.BROWN.value


def test_engine_version_change_invalidates_cache():
    store = InMemoryStore()
    digest = image_sha256(b"identical-oreo-stool")
    identity = engine_identity(provider="openai", model="gpt-5-mini")
    store_cached_observation(
        store,
        user_id="user-a",
        dog_id="dog-oreo",
        image_sha256_hex=digest,
        identity=identity,
        observation=prepare_digestive_observation(_obs()),
        source_event_id="event-1",
    )
    other = engine_identity(
        provider="openai",
        model="gpt-5-mini",
        prompt_version="digestive-observer/v3",
    )
    assert (
        lookup_cached_observation(
            store,
            user_id="user-a",
            dog_id="dog-oreo",
            image_sha256_hex=digest,
            identity=other,
        )
        is None
    )
    assert identity["observer_prompt_version"] == DIGESTIVE_OBSERVER_PROMPT_VERSION
    assert identity["schema_version"] == STOOL_OBSERVATION_SCHEMA_VERSION
    assert identity["normalizer_version"] == DIGESTIVE_NORMALIZER_VERSION


def test_eval_harness_is_stable_across_repeats():
    fixture = _obs(
        color="olive-brown",
        fecal_score_estimate=5,
        consistency="soft",
        foreign_material_candidate="possible",
    )
    runs = compare_repeated(fixture, runs=5)
    assert len({item["score"] for item in runs}) == 1
    assert len({item["color_family"] for item in runs}) == 1
    assert len({item["foreign"] for item in runs}) == 1
    assert len({item["safety_state"] for item in runs}) == 1
    snapshot = evaluate_observation(fixture)
    assert snapshot["score"] == 4
    assert snapshot["color_family"] == ColorFamily.GREEN_BROWN.value
    assert snapshot["foreign"] == "possible_unverified"
    assert "FOREIGN_MATERIAL_CANDIDATE" not in snapshot["flags"]
