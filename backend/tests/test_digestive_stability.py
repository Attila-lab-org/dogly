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
    persistable_image_quality,
    prepare_digestive_observation,
)
from app.domains.digestive_observation_cache import (
    engine_identity,
    image_sha256,
    lookup_cached_observation,
    store_cached_observation,
)
from app.domains.digestive_verification import (
    DIGESTIVE_ANOMALY_VERIFIER_VERSION,
    apply_anomaly_verification,
    gate_candidate,
    needed_anomaly_verifications,
    safety_candidate,
)
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


def test_possible_blood_is_not_corroborated_by_observer_confidence():
    prepared = prepare_digestive_observation(
        _obs(fresh_blood_candidate="possible", confidence_band="HIGH")
    )
    assert needed_anomaly_verifications(prepared) == ["fresh_blood_candidate"]
    assert gate_candidate(prepared, "fresh_blood_candidate") == "possible_unverified"
    assert prepared["learning_eligible"] is False
    result = build_digestive_intelligence(
        prepared,
        DigestiveContext(dog_name="Oreo", prior_scores=[4, 4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.ROUTINE


def test_confirmed_possible_blood_can_enter_safety():
    observation = apply_anomaly_verification(
        _obs(fresh_blood_candidate="possible", confidence_band="HIGH"),
        {"fresh_blood_candidate": "confirmed"},
    )
    prepared = prepare_digestive_observation(observation)
    assert safety_candidate(prepared, "fresh_blood_candidate") == "possible"
    result = build_digestive_intelligence(
        prepared,
        DigestiveContext(dog_name="Oreo", prior_scores=[4, 4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.ATTENTION
    assert prepared["learning_eligible"] is False


def test_verification_unavailable_is_retried_and_not_treated_as_not_confirmed():
    observation = apply_anomaly_verification(
        _obs(fresh_blood_candidate="possible"),
        {"fresh_blood_candidate": "verification_unavailable"},
    )
    assert needed_anomaly_verifications(observation) == ["fresh_blood_candidate"]
    prepared = prepare_digestive_observation(observation)
    assert safety_candidate(prepared, "fresh_blood_candidate") == "possible_unverified"
    result = build_digestive_intelligence(
        prepared,
        DigestiveContext(dog_name="Oreo", prior_scores=[4, 4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.MONITOR
    assert result.overall_state is not DigestiveState.ROUTINE


def test_stale_anomaly_verifier_version_is_rerun():
    observation = _obs(fresh_blood_candidate="possible")
    observation["anomaly_verification"] = {
        "fresh_blood_candidate": {
            "verdict": "not_confirmed",
            "prompt_version": "digestive-anomaly-verifier/v0",
        }
    }
    assert needed_anomaly_verifications(observation) == ["fresh_blood_candidate"]
    current = apply_anomaly_verification(
        observation, {"fresh_blood_candidate": "not_confirmed"}
    )
    assert needed_anomaly_verifications(current) == []
    assert (
        current["anomaly_verification"]["fresh_blood_candidate"]["prompt_version"]
        == DIGESTIVE_ANOMALY_VERIFIER_VERSION
    )


def test_not_confirmed_possible_blood_does_not_escalate():
    observation = apply_anomaly_verification(
        _obs(fresh_blood_candidate="possible"),
        {"fresh_blood_candidate": "not_confirmed"},
    )
    prepared = prepare_digestive_observation(observation)
    assert safety_candidate(prepared, "fresh_blood_candidate") == "possible_unverified"
    result = build_digestive_intelligence(
        prepared,
        DigestiveContext(dog_name="Oreo", prior_scores=[4, 4, 4, 4]),
    )
    assert result.safety_state is DigestiveState.ROUTINE


def test_clear_blood_is_never_lowered_by_verifier():
    observation = apply_anomaly_verification(
        _obs(fresh_blood_candidate="clear_candidate"),
        {"fresh_blood_candidate": "not_confirmed"},
    )
    prepared = prepare_digestive_observation(observation)
    assert safety_candidate(prepared, "fresh_blood_candidate") == "clear_candidate"
    assert needed_anomaly_verifications(prepared) == []


def test_safety_anomalies_are_not_learning_eligible():
    for field in (
        "fresh_blood_candidate",
        "melena_candidate",
        "foreign_material_candidate",
    ):
        prepared = prepare_digestive_observation(_obs(**{field: "clear_candidate"}))
        assert prepared["display_eligible"] is True
        assert prepared["learning_eligible"] is False
    watery = prepare_digestive_observation(_obs(consistency="watery", fecal_score_estimate=7))
    assert watery["learning_eligible"] is False


def test_legacy_null_learning_eligible_is_not_baseline_valid():
    from datetime import UTC, datetime, timedelta

    from app.domains.digestive import build_inmemory_digestive_context
    from app.domains.models import DogRec, FecalEventRec

    store = InMemoryStore()
    now = datetime.now(UTC)
    store.dogs["dog-1"] = DogRec(
        id="dog-1",
        owner_id="user-1",
        name="Oreo",
        created_at=now,
    )
    current = FecalEventRec(
        id="now",
        dog_id="dog-1",
        user_id="user-1",
        client_request_id="now",
        image_path="path",
        created_at=now,
        status="COMPLETED",
        fecal_score_estimate=4,
        learning_eligible=True,
    )
    store.fecal_events["now"] = current
    for index, score in enumerate((2, 2, 2, 2)):
        store.fecal_events[f"legacy-{index}"] = FecalEventRec(
            id=f"legacy-{index}",
            dog_id="dog-1",
            user_id="user-1",
            client_request_id=f"legacy-{index}",
            image_path="path",
            created_at=now - timedelta(days=index + 1),
            status="COMPLETED",
            fecal_score_estimate=score,
            learning_eligible=None,
        )
    context = build_inmemory_digestive_context(store, event=current)
    assert context.prior_scores == []


def test_digestive_summary_uses_only_learning_eligible_scores():
    from datetime import UTC, datetime, timedelta

    from app.domains.digestive import digestive_summary
    from app.domains.models import DogRec, FecalEventRec

    store = InMemoryStore()
    now = datetime.now(UTC)
    dog_id = "00000000-0000-0000-0000-000000000001"
    user_id = "00000000-0000-0000-0000-0000000000aa"
    store.dogs[dog_id] = DogRec(
        id=dog_id,
        owner_id=user_id,
        name="Oreo",
        created_at=now,
    )
    store.fecal_events["eligible"] = FecalEventRec(
        id="eligible",
        dog_id=dog_id,
        user_id=user_id,
        client_request_id="eligible",
        image_path="path",
        created_at=now,
        status="COMPLETED",
        fecal_score_estimate=4,
        learning_eligible=True,
        safety_flags=[],
    )
    for index, score in enumerate((7, 7, 7)):
        store.fecal_events[f"legacy-{index}"] = FecalEventRec(
            id=f"legacy-{index}",
            dog_id=dog_id,
            user_id=user_id,
            client_request_id=f"legacy-{index}",
            image_path="path",
            created_at=now - timedelta(days=index + 1),
            status="COMPLETED",
            fecal_score_estimate=score,
            learning_eligible=None,
            safety_flags=[{"code": "LEGACY_FLAG", "severity": "low"}],
        )
    summary = digestive_summary(store, user_id=user_id, dog_id=dog_id)
    assert summary["rolling_score"] == 4.0
    assert summary["data_sufficiency"] == "low"
    assert summary["recent_trend"] is None
    assert any(flag["code"] == "LEGACY_FLAG" for flag in summary["safety_flags"])


def test_image_quality_persists_as_sufficient_or_insufficient():
    assert persistable_image_quality("sufficient") == "SUFFICIENT"
    assert persistable_image_quality("insufficient") == "INSUFFICIENT"
    assert persistable_image_quality("unknown") is None


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
    assert identity["anomaly_verifier_version"] == DIGESTIVE_ANOMALY_VERIFIER_VERSION


def test_cache_refresh_persists_new_verifier_verdict():
    store = InMemoryStore()
    digest = image_sha256(b"identical-oreo-stool")
    identity = engine_identity(provider="openai", model="gpt-5-mini")
    stale = apply_anomaly_verification(
        _obs(fresh_blood_candidate="possible"),
        {"fresh_blood_candidate": "not_confirmed"},
    )
    stale["anomaly_verification"]["fresh_blood_candidate"]["prompt_version"] = (
        "digestive-anomaly-verifier/v0"
    )
    store_cached_observation(
        store,
        user_id="user-a",
        dog_id="dog-oreo",
        image_sha256_hex=digest,
        identity=identity,
        observation=stale,
        source_event_id="event-1",
    )
    cached = lookup_cached_observation(
        store,
        user_id="user-a",
        dog_id="dog-oreo",
        image_sha256_hex=digest,
        identity=identity,
    )
    assert needed_anomaly_verifications(cached or {}) == ["fresh_blood_candidate"]
    refreshed = apply_anomaly_verification(
        dict(cached or {}),
        {"fresh_blood_candidate": "not_confirmed"},
    )
    store_cached_observation(
        store,
        user_id="user-a",
        dog_id="dog-oreo",
        image_sha256_hex=digest,
        identity=identity,
        observation=refreshed,
        source_event_id="event-2",
    )
    latest = lookup_cached_observation(
        store,
        user_id="user-a",
        dog_id="dog-oreo",
        image_sha256_hex=digest,
        identity=identity,
    )
    assert latest is not None
    assert (
        latest["anomaly_verification"]["fresh_blood_candidate"]["prompt_version"]
        == DIGESTIVE_ANOMALY_VERIFIER_VERSION
    )
    assert needed_anomaly_verifications(latest) == []


def test_anomaly_verifier_version_change_invalidates_cache():
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
        anomaly_verifier_version="digestive-anomaly-verifier/v2",
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
