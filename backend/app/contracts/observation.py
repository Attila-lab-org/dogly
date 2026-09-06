"""ObservationContract V0 — objective video facts (Spec V1 sez. 15).

The observer is NOT asked "what does the dog want?": it populates a versioned
JSON schema of objective observables. Every feature supports
unknown/not_visible when the media cannot support a claim. Observer output is
schema-validated and never executed as code (prompt-injection rule, sez. 15).

Observable features are CLOSED vocabularies (StrEnum): il provider video
riceve i soli valori ammessi e il contratto rifiuta valori fuori vocabolario.
La normalizzazione difensiva (`normalize_observation_dict`) mappa alias/sinonimi
comuni verso il valore canonico prima della validazione: i provider possono
ignorare le istruzioni, il pipeline non deve mai rompersi per questo.
"""

from __future__ import annotations

import re
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


class BodyHeight(StrEnum):
    """Altezza del corpo rispetto alla stazione neutra."""

    LOWERED = "lowered"
    NEUTRAL = "neutral"
    RAISED = "raised"
    UNKNOWN = "unknown"


class Posture(StrEnum):
    """Postura globale osservata (inclusi i segnali morfologia-specifici)."""

    LOOSE = "loose"
    CROUCH = "crouch"
    LOWERED = "lowered"
    STIFF = "stiff"
    PLAY_BOW = "play_bow"
    UNKNOWN = "unknown"


class Locomotion(StrEnum):
    """Modalità di spostamento osservata."""

    STILL = "still"
    WALKING = "walking"
    RUNNING = "running"
    UNKNOWN = "unknown"


class ApproachWithdrawalFreeze(StrEnum):
    """Direzione del movimento relativa allo stimolo."""

    APPROACH = "approach"
    WITHDRAWAL = "withdrawal"
    FREEZE = "freeze"
    NONE = "none"
    UNKNOWN = "unknown"


class EarPosition(StrEnum):
    """Posizione delle orecchie (consapevole della morfologia, sez. 15)."""

    FORWARD = "forward"
    NEUTRAL_FORWARD = "neutral_forward"
    BACK = "back"
    FLAT_BACK = "flat_back"
    NEUTRAL = "neutral"
    UNKNOWN = "unknown"


class TailHeight(StrEnum):
    """Altezza della coda relativa alla stazione neutra del cane."""

    ABOVE = "above"
    NEUTRAL = "neutral"
    BELOW = "below"
    TUCKED = "tucked"
    UNKNOWN = "unknown"


class TailMovement(StrEnum):
    """Movimento della coda osservato."""

    STILL = "still"
    WAGGING = "wagging"
    STIFF_SWEEP = "stiff_sweep"
    UNKNOWN = "unknown"


class VocalizationType(StrEnum):
    """Tipo di vocalizzazione udibile."""

    BARK = "bark"
    GROWL = "growl"
    WHINE = "whine"
    WHIMPER = "whimper"
    HOWL = "howl"
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

    body_height: BodyHeight = BodyHeight.UNKNOWN
    posture: Posture = Posture.UNKNOWN
    rigidity_candidate: TriState = TriState.UNKNOWN
    weight_shift: str = "unknown"  # forward / backward / neutral / unknown
    orientation_target: str = "unknown"
    locomotion: Locomotion = Locomotion.UNKNOWN
    approach_withdrawal_freeze: ApproachWithdrawalFreeze = ApproachWithdrawalFreeze.UNKNOWN


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
    # Morphology-aware position/change: closed vocabulary, never a dictionary claim.
    position: EarPosition = EarPosition.UNKNOWN
    change: str = "unknown"
    uncertainty: str = "unknown"


class Tail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visible: TriState = TriState.UNKNOWN
    neutral_relative_height: TailHeight = TailHeight.UNKNOWN
    movement: TailMovement = TailMovement.UNKNOWN
    speed_amp_qualitative: str = "unknown"
    uncertainty: str = "unknown"


class Vocalization(BaseModel):
    model_config = ConfigDict(extra="forbid")

    present: TriState = TriState.UNKNOWN
    type_candidates: list[VocalizationType] = Field(default_factory=list)
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


# ---------------------------------------------------------------------------
# Normalizzazione difensiva (belt-and-braces sopra il vocabolario chiuso).
#
# Alias/sinonimi comuni che i provider generativi usano anche quando il prompt
# elenca i valori ammessi. Chiave dell'alias: minuscolo, spazi/Trattini ->
# underscore. Valori non riconosciuti -> "unknown" (il pipeline non si rompe
# MAI per un vocabolario fuori standard); la validazione pydantic resta strict
# sui valori canonici.
# ---------------------------------------------------------------------------

def _alias_key(value: object) -> str:
    return re.sub(r"[\s\-]+", "_", str(value).strip().lower())


# (percorso nel payload, enum) per i campi scalari chiusi.
_SCALAR_ENUM_FIELDS: tuple[tuple[tuple[str, str], type[StrEnum]], ...] = (
    (("body", "body_height"), BodyHeight),
    (("body", "posture"), Posture),
    (("body", "locomotion"), Locomotion),
    (("body", "approach_withdrawal_freeze"), ApproachWithdrawalFreeze),
    (("ears", "position"), EarPosition),
    (("tail", "neutral_relative_height"), TailHeight),
    (("tail", "movement"), TailMovement),
)

# Tabella degli alias testata: alias normalizzato -> valore canonico.
_ENUM_ALIASES: dict[type[StrEnum], dict[str, str]] = {
    BodyHeight: {
        "crouched": BodyHeight.LOWERED.value,
        "crouch": BodyHeight.LOWERED.value,
        "sunken": BodyHeight.LOWERED.value,
        "squatting": BodyHeight.LOWERED.value,
        "tall": BodyHeight.RAISED.value,
        "elevated": BodyHeight.RAISED.value,
        "upright": BodyHeight.RAISED.value,
    },
    Posture: {
        "playbow": Posture.PLAY_BOW.value,
        "play_bow_candidate": Posture.PLAY_BOW.value,
        "crouched": Posture.CROUCH.value,
        "tense": Posture.STIFF.value,
        "rigid": Posture.STIFF.value,
        "tensed": Posture.STIFF.value,
    },
    Locomotion: {
        "stationary": Locomotion.STILL.value,
        "motionless": Locomotion.STILL.value,
        "immobile": Locomotion.STILL.value,
        "walk": Locomotion.WALKING.value,
        "moving": Locomotion.WALKING.value,
        "run": Locomotion.RUNNING.value,
        "trotting": Locomotion.RUNNING.value,
    },
    ApproachWithdrawalFreeze: {
        "advancing": ApproachWithdrawalFreeze.APPROACH.value,
        "moving_toward": ApproachWithdrawalFreeze.APPROACH.value,
        "coming_closer": ApproachWithdrawalFreeze.APPROACH.value,
        "retreating": ApproachWithdrawalFreeze.WITHDRAWAL.value,
        "retreat": ApproachWithdrawalFreeze.WITHDRAWAL.value,
        "moving_away": ApproachWithdrawalFreeze.WITHDRAWAL.value,
        "backing_away": ApproachWithdrawalFreeze.WITHDRAWAL.value,
        "avoidance": ApproachWithdrawalFreeze.WITHDRAWAL.value,
        "frozen": ApproachWithdrawalFreeze.FREEZE.value,
        "immobile": ApproachWithdrawalFreeze.FREEZE.value,
        "no_movement": ApproachWithdrawalFreeze.NONE.value,
    },
    EarPosition: {
        "pricked": EarPosition.FORWARD.value,
        "erect": EarPosition.FORWARD.value,
        "upright": EarPosition.FORWARD.value,
        "pinned": EarPosition.BACK.value,
        "ears_back": EarPosition.BACK.value,
        "backward": EarPosition.BACK.value,
        "flattened": EarPosition.FLAT_BACK.value,
        "flat": EarPosition.FLAT_BACK.value,
        "pinned_back": EarPosition.FLAT_BACK.value,
    },
    TailHeight: {
        "low": TailHeight.BELOW.value,
        "down": TailHeight.BELOW.value,
        "dropped": TailHeight.BELOW.value,
        "high": TailHeight.ABOVE.value,
        "up": TailHeight.ABOVE.value,
        "raised_high": TailHeight.ABOVE.value,
        "between_legs": TailHeight.TUCKED.value,
    },
    TailMovement: {
        "wag": TailMovement.WAGGING.value,
        "wagging_tail": TailMovement.WAGGING.value,
        "tail_wag": TailMovement.WAGGING.value,
        "not_moving": TailMovement.STILL.value,
        "motionless": TailMovement.STILL.value,
        "sweeping": TailMovement.STIFF_SWEEP.value,
        "stiff": TailMovement.STIFF_SWEEP.value,
        "rigid_sweep": TailMovement.STIFF_SWEEP.value,
    },
    VocalizationType: {
        "barking": VocalizationType.BARK.value,
        "snarl": VocalizationType.GROWL.value,
        "snarling": VocalizationType.GROWL.value,
        "grumbling": VocalizationType.GROWL.value,
        "crying": VocalizationType.WHINE.value,
        "yelping": VocalizationType.WHIMPER.value,
        "yelp": VocalizationType.WHIMPER.value,
        "scream": VocalizationType.WHIMPER.value,
        "baying": VocalizationType.HOWL.value,
    },
}


def _canonical_enum_value(enum: type[StrEnum], raw: object) -> str:
    """Mappa un valore grezzo al valore canonico dell'enum; garbage -> unknown."""
    if not isinstance(raw, str):
        return enum.UNKNOWN.value
    key = _alias_key(raw)
    if key in {member.value for member in enum}:
        return key
    return _ENUM_ALIASES.get(enum, {}).get(key, enum.UNKNOWN.value)


def normalize_observation_dict(raw: dict) -> dict:
    """Normalizza un payload grezzo del provider PRIMA della validazione pydantic.

    Campi chiusi: alias/sinonimi -> valore canonico, valori non riconosciuti
    -> "unknown". Non tocca gli altri campi; non solleva mai eccezioni.
    """
    normalized = dict(raw)
    for (section, field_name), enum in _SCALAR_ENUM_FIELDS:
        section_data = normalized.get(section)
        if isinstance(section_data, dict) and field_name in section_data:
            section_data = dict(section_data)
            section_data[field_name] = _canonical_enum_value(
                enum, section_data[field_name]
            )
            normalized[section] = section_data
    vocalization = normalized.get("vocalization")
    if isinstance(vocalization, dict) and "type_candidates" in vocalization:
        candidates = vocalization["type_candidates"]
        vocalization = dict(vocalization)
        vocalization["type_candidates"] = (
            [_canonical_enum_value(VocalizationType, item) for item in candidates]
            if isinstance(candidates, list)
            else candidates
        )
        normalized["vocalization"] = vocalization
    return normalized
