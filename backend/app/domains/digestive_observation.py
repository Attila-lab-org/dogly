"""Deterministic post-observer normalization for digestive captures.

The vision model only describes visible facts. Color families, fecal-score
estimates used for reasoning, and learning eligibility are derived here so
the same visible features always produce the same downstream state.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from app.domains.digestive_verification import verify_anomaly_candidates

DIGESTIVE_OBSERVER_PROMPT_VERSION = "digestive-observer/v2"
DIGESTIVE_NORMALIZER_VERSION = "digestive-normalizer/v1"


class ColorFamily(StrEnum):
    BROWN = "BROWN"
    DARK_BROWN = "DARK_BROWN"
    LIGHT_BROWN = "LIGHT_BROWN"
    GREEN_BROWN = "GREEN_BROWN"
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    ORANGE = "ORANGE"
    RED_APPEARANCE = "RED_APPEARANCE"
    BLACK_TARRY_APPEARANCE = "BLACK_TARRY_APPEARANCE"
    PALE_GRAY = "PALE_GRAY"
    OTHER = "OTHER"
    UNKNOWN = "UNKNOWN"


COLOR_FAMILY_IT: dict[ColorFamily, str] = {
    ColorFamily.BROWN: "marrone",
    ColorFamily.DARK_BROWN: "marrone scuro",
    ColorFamily.LIGHT_BROWN: "marrone chiaro",
    ColorFamily.GREEN_BROWN: "marrone con una tonalità verdastra",
    ColorFamily.GREEN: "verde",
    ColorFamily.YELLOW: "giallo",
    ColorFamily.ORANGE: "arancione",
    ColorFamily.RED_APPEARANCE: "con una tonalità rossastra",
    ColorFamily.BLACK_TARRY_APPEARANCE: "molto scuro, quasi nero",
    ColorFamily.PALE_GRAY: "chiaro, tendente al grigio",
}

_CONSISTENCY_IT = {
    "hard": "dure",
    "formed": "ben formate",
    "soft": "morbide",
    "unformed": "poco formate",
    "watery": "liquide",
}

_TOKEN_ALIASES = {
    "grey": "gray",
    "greyish": "gray",
    "grayish": "gray",
    "olive": "green",
    "olivegreen": "green",
    "khaki": "green",
    "tan": "brown",
    "chocolate": "brown",
    "coffee": "brown",
    "caramel": "brown",
    "beige": "light",
    "cream": "pale",
    "white": "pale",
    "whitish": "pale",
    "blackish": "black",
    "tarry": "tarry",
    "tar": "tarry",
    "bloody": "red",
    "reddish": "red",
    "yellowish": "yellow",
    "orangish": "orange",
    "greenish": "green",
    "brownish": "brown",
    "darker": "dark",
    "lighter": "light",
}


def _tokens(value: str) -> list[str]:
    raw = (
        str(value or "")
        .strip()
        .lower()
        .replace("_", " ")
        .replace("/", " ")
        .replace("-", " ")
    )
    parts = [item for item in raw.split() if item and item != "unknown"]
    return [_TOKEN_ALIASES.get(item, item) for item in parts]


def canonicalize_color(value: str | None) -> ColorFamily:
    raw = str(value or "").strip().lower().replace("_", "-")
    if "olive" in raw:
        return ColorFamily.GREEN_BROWN
    tokens = _tokens(value or "")
    if not tokens:
        return ColorFamily.UNKNOWN
    joined = " ".join(tokens)
    if joined in {"unknown", "not assessable", "n a", "na"}:
        return ColorFamily.UNKNOWN
    has = set(tokens)
    if has & {"black", "tarry", "melena"}:
        return ColorFamily.BLACK_TARRY_APPEARANCE
    if has & {"red", "blood"}:
        return ColorFamily.RED_APPEARANCE
    if has & {"pale", "gray"} and "brown" not in has:
        return ColorFamily.PALE_GRAY
    if "yellow" in has and "brown" not in has and "green" not in has:
        return ColorFamily.YELLOW
    if "orange" in has and "brown" not in has:
        return ColorFamily.ORANGE
    if "green" in has and "brown" in has:
        return ColorFamily.GREEN_BROWN
    if "green" in has:
        return ColorFamily.GREEN
    if "brown" in has and has & {"dark", "deep"}:
        return ColorFamily.DARK_BROWN
    if "brown" in has and has & {"light", "pale"}:
        return ColorFamily.LIGHT_BROWN
    if "brown" in has:
        return ColorFamily.BROWN
    if has & {"dark", "deep"} and not (has - {"dark", "deep"}):
        return ColorFamily.DARK_BROWN
    return ColorFamily.OTHER


def color_family_copy(family: ColorFamily | str) -> str | None:
    if isinstance(family, str):
        try:
            family = ColorFamily(family)
        except ValueError:
            family = canonicalize_color(family)
    return COLOR_FAMILY_IT.get(family)


def derive_fecal_score(observation: dict[str, Any]) -> tuple[int | None, str]:
    """Derive a stable 1–7 visual estimate from visible form features.

    Soft stool defaults to 4 unless moisture is high *and* the pile no longer
    holds shape. That prevents 4↔5 flicker from the same visible facts.
    """
    if str(observation.get("image_quality") or "").lower() == "insufficient":
        return None, "none"
    consistency = str(observation.get("consistency") or "unknown").lower()
    moisture = str(observation.get("apparent_moisture") or "unknown").lower()
    segmentation = str(observation.get("segmentation") or "unknown").lower()
    model_raw = observation.get("fecal_score_estimate")
    model = int(model_raw) if isinstance(model_raw, int | float) else None

    if consistency == "watery":
        return 7, "derived"
    if consistency == "unformed":
        return 6, "derived"
    if consistency == "hard":
        if moisture == "low" or segmentation == "present":
            return 1, "derived"
        return 2, "derived"
    if consistency == "formed":
        if moisture == "high":
            return 4, "derived"
        if moisture == "low" and segmentation == "present":
            return 2, "derived"
        if moisture in {"normal", "low"} or segmentation == "present":
            return 3, "derived"
        if model in {2, 3, 4}:
            return model, "model_constrained"
        return 3, "derived"
    if consistency == "soft":
        loses_shape = segmentation in {"reduced", "absent"}
        if moisture == "high" and loses_shape:
            return 5, "derived"
        return 4, "derived"
    if model is not None and 1 <= model <= 7:
        return model, "model"
    return None, "none"


def persistable_image_quality(value: object) -> str | None:
    """Top-level fecal_events.image_quality uses SUFFICIENT / INSUFFICIENT only."""

    raw = str(value or "").strip().lower()
    if raw == "sufficient":
        return "SUFFICIENT"
    if raw == "insufficient":
        return "INSUFFICIENT"
    return None


def api_image_quality(
    observation: dict[str, Any], persisted: str | None = None
) -> str:
    raw = str(observation.get("image_quality") or persisted or "").strip().lower()
    if raw in {"sufficient", "insufficient"}:
        return raw
    return "unknown"


def is_display_eligible(observation: dict[str, Any]) -> bool:
    return str(observation.get("image_quality") or "").lower() == "sufficient"


_LEARNING_ANOMALY_FIELDS = (
    "fresh_blood_candidate",
    "melena_candidate",
    "foreign_material_candidate",
    "mucus_candidate",
    "undigested_food_candidate",
)


def is_learning_eligible(observation: dict[str, Any]) -> bool:
    """Eligible to teach the personal baseline. Diary display is separate.

    Legacy rows with learning_eligible NULL are not equivalent to True.
    Safety-relevant or otherwise anomalous observations stay visible but
    must not define the dog's digestive normal.
    """
    if not is_display_eligible(observation):
        return False
    if observation.get("fecal_score_estimate") is None:
        return False
    confidence = str(observation.get("confidence_band") or "LOW").upper()
    if confidence == "LOW":
        return False
    consistency = str(observation.get("consistency") or "unknown").lower()
    if consistency in {"watery", "unformed"}:
        return False
    safety = observation.get("safety_candidates") or {}
    blocking = {
        "possible",
        "possible_unverified",
        "clear_candidate",
    }
    for field in _LEARNING_ANOMALY_FIELDS:
        raw = str(observation.get(field) or "").lower()
        gated = str(safety.get(field) or "").lower()
        if raw in blocking or gated in blocking:
            return False
    return True


def observation_summary(observation: dict[str, Any], *, dog_name: str | None = None) -> str:
    consistency = _CONSISTENCY_IT.get(str(observation.get("consistency") or "").lower())
    family = observation.get("color_family") or canonicalize_color(
        str(observation.get("color") or "")
    )
    color = color_family_copy(family)
    subject = f"Le feci di {dog_name}" if dog_name else "Le feci"
    if consistency and color:
        if family in {
            ColorFamily.RED_APPEARANCE,
            ColorFamily.BLACK_TARRY_APPEARANCE,
        }:
            return f"{subject} appaiono {consistency} e {color}."
        return f"{subject} appaiono {consistency} e di un colore {color}."
    if consistency:
        return f"{subject} appaiono {consistency}."
    if color:
        return f"Il colore appare {color}."
    return "La foto permette un confronto con le osservazioni precedenti."


def prepare_digestive_observation(
    observation: dict[str, Any],
    *,
    image_sha256: str | None = None,
    observer_provider: str | None = None,
    observer_model: str | None = None,
    safety_candidates: dict[str, str] | None = None,
) -> dict[str, Any]:
    prepared = dict(observation)
    raw_color = str(prepared.get("color_raw") or prepared.get("color") or "unknown")
    family = canonicalize_color(raw_color)
    prepared["color_raw"] = raw_color
    prepared["color_family"] = family.value
    if family is not ColorFamily.OTHER:
        prepared["color"] = family.value.lower()
    score, source = derive_fecal_score(prepared)
    prepared["fecal_score_model"] = observation.get("fecal_score_estimate")
    prepared["fecal_score_estimate"] = score
    prepared["fecal_score_source"] = source
    prepared["safety_candidates"] = (
        safety_candidates
        if safety_candidates is not None
        else verify_anomaly_candidates(prepared)
    )
    prepared["observer_prompt_version"] = (
        prepared.get("observer_prompt_version") or DIGESTIVE_OBSERVER_PROMPT_VERSION
    )
    prepared["normalizer_version"] = DIGESTIVE_NORMALIZER_VERSION
    if image_sha256:
        prepared["image_sha256"] = image_sha256
    meta = dict(prepared.get("meta") or {})
    if observer_provider:
        meta["provider"] = observer_provider
    if observer_model:
        meta["model"] = observer_model
    meta["prompt_version"] = prepared["observer_prompt_version"]
    meta["normalizer_version"] = DIGESTIVE_NORMALIZER_VERSION
    if meta:
        prepared["meta"] = meta
    prepared["display_eligible"] = is_display_eligible(prepared)
    prepared["learning_eligible"] = is_learning_eligible(prepared)
    return prepared
