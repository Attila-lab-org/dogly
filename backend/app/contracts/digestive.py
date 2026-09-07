"""Stool ObservationContract (Spec V1 sez. 19.1).

Estimates only — never lab measurement. "Candidate" fields never prove
absence (sez. 19.3).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.taxonomy import STOOL_OBSERVATION_SCHEMA_VERSION, ConfidenceBand


class CandidateLevel(StrEnum):
    """Candidate only; a vision model failing to see an anomaly never proves absence."""

    NONE_OBSERVED = "none_observed"
    POSSIBLE = "possible"
    CLEAR_CANDIDATE = "clear_candidate"
    UNKNOWN = "unknown"


class FecalConsistency(StrEnum):
    HARD = "hard"
    FORMED = "formed"
    SOFT = "soft"
    UNFORMED = "unformed"
    WATERY = "watery"
    UNKNOWN = "unknown"


class StoolObservationMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = STOOL_OBSERVATION_SCHEMA_VERSION
    provider: str
    model: str
    request_id: str


class StoolObservationContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = STOOL_OBSERVATION_SCHEMA_VERSION
    image_quality: Literal["sufficient", "insufficient"] = "insufficient"
    warnings: list[str] = Field(default_factory=list)
    # 1-7 estimate or null; exposed as estimate, not lab measurement.
    fecal_score_estimate: int | None = Field(default=None, ge=1, le=7)
    consistency: FecalConsistency = FecalConsistency.UNKNOWN
    shape: str = "unknown"
    apparent_moisture: Literal["low", "normal", "high", "unknown"] = "unknown"
    segmentation: Literal["present", "reduced", "absent", "unknown"] = "unknown"
    color: str = "unknown"
    color_uncertainty: str = "unknown"
    color_uniformity: Literal["uniform", "non_uniform", "unknown"] = "unknown"
    mucus_candidate: CandidateLevel = CandidateLevel.UNKNOWN
    fresh_blood_candidate: CandidateLevel = CandidateLevel.UNKNOWN
    melena_candidate: CandidateLevel = CandidateLevel.UNKNOWN
    foreign_material_candidate: CandidateLevel = CandidateLevel.UNKNOWN
    undigested_food_candidate: CandidateLevel = CandidateLevel.UNKNOWN
    apparent_volume: Literal["low", "normal", "high", "not_assessable"] = (
        "not_assessable"
    )
    confidence_band: ConfidenceBand = ConfidenceBand.LOW
    meta: StoolObservationMeta
