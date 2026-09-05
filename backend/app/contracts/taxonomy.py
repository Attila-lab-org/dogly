"""Canonical status & policy values (Spec V1 Appendix A, sez. 33).

All status values and taxonomies live here as versioned backend constants.
Never use Postgres ENUM for fast-evolving AI taxonomy (sez. 11.1).
"""

from __future__ import annotations

from enum import StrEnum

# --- Versions (audit & replay, sez. 16.3) ---
OBSERVATION_SCHEMA_VERSION = "observation.v0"
INTERPRETATION_SCHEMA_VERSION = "interpretation.v0"
STOOL_OBSERVATION_SCHEMA_VERSION = "stool_observation.v0"
INTERPRETATION_POLICY_VERSION = "policy.v0"
INTENT_TAXONOMY_VERSION = "intent_taxonomy.v0"


class BehaviorEventStatus(StrEnum):
    """Behavior analysis state machine (sez. 7.2 / 33.1)."""

    DRAFT = "DRAFT"
    UPLOADING = "UPLOADING"
    QUEUED = "QUEUED"
    OBSERVING = "OBSERVING"
    INTERPRETING = "INTERPRETING"
    COMPLETED = "COMPLETED"
    REJECTED_QUALITY = "REJECTED_QUALITY"
    FAILED_RETRYABLE = "FAILED_RETRYABLE"
    FAILED_TERMINAL = "FAILED_TERMINAL"
    CANCELLED = "CANCELLED"


TERMINAL_EVENT_STATUSES = frozenset(
    {
        BehaviorEventStatus.COMPLETED,
        BehaviorEventStatus.REJECTED_QUALITY,
        BehaviorEventStatus.FAILED_TERMINAL,
        BehaviorEventStatus.CANCELLED,
    }
)

# Allowed transitions for the behavior state machine (sez. 7.2).
BEHAVIOR_EVENT_TRANSITIONS: dict[BehaviorEventStatus, frozenset[BehaviorEventStatus]] = {
    BehaviorEventStatus.DRAFT: frozenset({BehaviorEventStatus.UPLOADING, BehaviorEventStatus.CANCELLED}),
    BehaviorEventStatus.UPLOADING: frozenset({BehaviorEventStatus.QUEUED, BehaviorEventStatus.CANCELLED}),
    BehaviorEventStatus.QUEUED: frozenset({BehaviorEventStatus.OBSERVING, BehaviorEventStatus.CANCELLED}),
    BehaviorEventStatus.OBSERVING: frozenset(
        {
            BehaviorEventStatus.INTERPRETING,
            BehaviorEventStatus.REJECTED_QUALITY,
            BehaviorEventStatus.FAILED_RETRYABLE,
            BehaviorEventStatus.FAILED_TERMINAL,
        }
    ),
    BehaviorEventStatus.INTERPRETING: frozenset(
        {
            BehaviorEventStatus.COMPLETED,
            BehaviorEventStatus.FAILED_RETRYABLE,
            BehaviorEventStatus.FAILED_TERMINAL,
        }
    ),
    # Retry re-enters the pipeline from FAILED_RETRYABLE (queue platform
    # backoff — Vercel Workflows in V1, per SPEC_AMENDMENT_V1.1).
    BehaviorEventStatus.FAILED_RETRYABLE: frozenset(
        {BehaviorEventStatus.OBSERVING, BehaviorEventStatus.FAILED_TERMINAL}
    ),
    BehaviorEventStatus.COMPLETED: frozenset(),
    BehaviorEventStatus.REJECTED_QUALITY: frozenset(),
    BehaviorEventStatus.FAILED_TERMINAL: frozenset(),
    BehaviorEventStatus.CANCELLED: frozenset(),
}


class FeedbackValue(StrEnum):
    YES = "YES"
    NO = "NO"
    UNKNOWN = "UNKNOWN"


class CareEventType(StrEnum):
    VACCINE = "VACCINE"
    VET_VISIT = "VET_VISIT"
    PARASITE_TREATMENT = "PARASITE_TREATMENT"
    EXAM = "EXAM"
    THERAPY = "THERAPY"
    OTHER = "OTHER"


class CareEventStatus(StrEnum):
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PatternState(StrEnum):
    CANDIDATE = "CANDIDATE"
    PRELIMINARY = "PRELIMINARY"
    ESTABLISHED = "ESTABLISHED"
    STRONG = "STRONG"
    CONTESTED = "CONTESTED"
    DORMANT = "DORMANT"
    ARCHIVED = "ARCHIVED"


# Only these states are eligible to be passed to the reasoner (sez. 17.2).
ELIGIBLE_PATTERN_STATES = frozenset(
    {PatternState.PRELIMINARY, PatternState.ESTABLISHED, PatternState.STRONG}
)


class ConfidenceBand(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RetentionState(StrEnum):
    TEMPORARY = "TEMPORARY"
    USER_KEPT = "USER_KEPT"
    RESEARCH_OPT_IN = "RESEARCH_OPT_IN"
    DELETE_PENDING = "DELETE_PENDING"
    DELETED = "DELETED"


class AnalysisDomain(StrEnum):
    BEHAVIOR = "BEHAVIOR"
    DIGESTIVE = "DIGESTIVE"
    FOOD_LABEL = "FOOD_LABEL"


class ContextBucket(StrEnum):
    """Context buckets V0 (sez. 33.7)."""

    HOME = "HOME"
    OUTDOORS = "OUTDOORS"
    WALK = "WALK"
    PLAY = "PLAY"
    FEEDING = "FEEDING"
    DOOR_EXIT = "DOOR_EXIT"
    REST = "REST"
    STRANGER = "STRANGER"
    OTHER_DOG = "OTHER_DOG"
    VEHICLE = "VEHICLE"
    HANDLING = "HANDLING"
    UNKNOWN = "UNKNOWN"


class IntentCode(StrEnum):
    """Initial closed intent taxonomy (sez. 16.2).

    Closed allowlist: provider output outside this set is schema-invalid.
    """

    PLAY_INTERACTION = "PLAY_INTERACTION"
    ATTENTION_REQUEST = "ATTENTION_REQUEST"
    OUTSIDE_REQUEST = "OUTSIDE_REQUEST"
    ALERT_VIGILANCE = "ALERT_VIGILANCE"
    DISCOMFORT_AVOIDANCE = "DISCOMFORT_AVOIDANCE"
    FEAR_INSECURITY = "FEAR_INSECURITY"
    HIGH_AROUSAL = "HIGH_AROUSAL"
    FRUSTRATION = "FRUSTRATION"
    RELAX_REST = "RELAX_REST"
    RESOURCE_TENSION = "RESOURCE_TENSION"
    AMBIGUOUS = "AMBIGUOUS"
    INSUFFICIENT = "INSUFFICIENT"
