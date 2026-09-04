"""ObservationContract V0 — objective video facts (Spec V1 sez. 15).

The observer is NOT asked "what does the dog want?": it populates a versioned
JSON schema of objective observables. Every feature supports
unknown/not_visible when the media cannot support a claim. Observer output is
schema-validated and never executed as code (prompt-injection rule, sez. 15).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.taxonomy import OBSERVATION_SCHEMA_VERSION


class QualityBand(StrEnum):
    GOOD = "good"
    DEGRADED = "degraded"
    INSUFFICIENT = "insufficient"


class TriState(StrEnum):
    """Candidate signal: present / absent / not observable."""

    YES = "yes"
    NO = "no"
    UNKNOWN = "unknown"


class CaptureQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dog_visible_fraction: float | None = Field(default=None, ge=0.0, le=1.0)
    framing: QualityBand | Literal["unknown"] = "unknown"
    lighting: QualityBand | Literal["unknown"] = "unknown"
    motion_blur: QualityBand | Literal["unknown"] = "unknown"
    audio_quality: QualityBand | Literal["unknown", "absent"] = "unknown"
    overall_quality: QualityBand = QualityBand.INSUFFICIENT
    warnings: list[str] = Field(default_factory=list)


class Scene(BaseModel):
    model_config = ConfigDict(extra="forbid")

    environment_class: str = "unknown"
    human_count: int | None = Field(default=None, ge=0)
    dog_count: int | None = Field(default=None, ge=0)
    visible_objects: list[str] = Field(default_factory=list)
    spatial_relations: list[str] = Field(default_factory=list)


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body_height: str = "unknown"  # e.g. lowered / neutral / raised / unknown
    posture: str = "unknown"
    rigidity_candidate: TriState = TriState.UNKNOWN
    weight_shift: str = "unknown"  # forward / backward / neutral / unknown
    orientation_target: str = "unknown"
    locomotion: str = "unknown"  # still / walking / running / unknown
    approach_withdrawal_freeze: str = "unknown"  # approach / withdrawal / freeze / none / unknown


class HeadFace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    head_orientation: str = "unknown"
    gaze_target: str = "unknown"
    eye_visibility: QualityBand | Literal["unknown"] = "unknown"
    mouth_state: str = "unknown"  # closed / open_relaxed / open_tense / unknown
    lip_lick_candidate: TriState = TriState.UNKNOWN
    yawn_candidate: TriState = TriState.UNKNOWN
    facial_visibility: QualityBand | Literal["unknown"] = "unknown"


class Ears(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visible: TriState = TriState.UNKNOWN
    # Morphology-aware position/change: free descriptor, never a dictionary claim.
    position: str = "unknown"
    change: str = "unknown"
    uncertainty: str = "unknown"


class Tail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visible: TriState = TriState.UNKNOWN
    neutral_relative_height: str = "unknown"  # above / neutral / below / tucked / unknown
    movement: str = "unknown"  # still / wagging / stiff_sweep / unknown
    speed_amp_qualitative: str = "unknown"
    uncertainty: str = "unknown"


class Vocalization(BaseModel):
    model_config = ConfigDict(extra="forbid")

    present: TriState = TriState.UNKNOWN
    type_candidates: list[str] = Field(default_factory=list)  # bark / whine / growl / howl ...
    count: int | None = Field(default=None, ge=0)
    relative_pitch: str = "unknown"
    intensity: str = "unknown"
    rhythm: str = "unknown"
    interval_pattern: str = "unknown"
    timing: str = "unknown"


class TimelineSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    observed_changes: list[str] = Field(default_factory=list)


class ObserverMeta(BaseModel):
    """Mandatory audit metadata (sez. 15)."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = OBSERVATION_SCHEMA_VERSION
    provider: str
    model: str
    request_id: str


class ObservationContract(BaseModel):
    """ObservationContract V0 root (sez. 15)."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = OBSERVATION_SCHEMA_VERSION
    capture_quality: CaptureQuality = Field(default_factory=CaptureQuality)
    scene: Scene = Field(default_factory=Scene)
    body: Body = Field(default_factory=Body)
    head_face: HeadFace = Field(default_factory=HeadFace)
    ears: Ears = Field(default_factory=Ears)
    tail: Tail = Field(default_factory=Tail)
    vocalization: Vocalization = Field(default_factory=Vocalization)
    timeline: list[TimelineSegment] = Field(default_factory=list)
    # Features not observable or quality-limited.
    unknowns: list[str] = Field(default_factory=list)
    observer_meta: ObserverMeta
