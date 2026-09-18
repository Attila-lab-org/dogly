from app.domains.digestive_eval import score_labeled_observation


def _observation(**updates):
    value = {
        "image_quality": "sufficient",
        "warnings": [],
        "fecal_score_estimate": 3,
        "consistency": "formed",
        "shape": "log",
        "apparent_moisture": "normal",
        "segmentation": "present",
        "color": "brown",
        "color_uncertainty": "low",
        "color_uniformity": "uniform",
        "mucus_candidate": "none_observed",
        "fresh_blood_candidate": "none_observed",
        "melena_candidate": "none_observed",
        "foreign_material_candidate": "none_observed",
        "undigested_food_candidate": "none_observed",
        "apparent_volume": "normal",
        "confidence_band": "HIGH",
    }
    value.update(updates)
    return value


def test_sparse_labeled_observation_scores_only_supplied_fields():
    scored = score_labeled_observation(
        _observation(),
        {
            "consistency": "formed",
            "color_family": "BROWN",
        },
    )

    assert scored["fields_scored"] == 2
    assert scored["fields_correct"] == 2
    assert scored["field_accuracy"] == 1.0


def test_safety_false_positive_is_reported_separately():
    scored = score_labeled_observation(
        _observation(fresh_blood_candidate="possible"),
        {"fresh_blood_candidate": "none_observed"},
    )

    assert scored["field_accuracy"] == 0.0
    assert scored["safety_false_positives"] == ["fresh_blood_candidate"]
    assert scored["safety_false_negatives"] == []
