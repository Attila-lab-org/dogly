"""Stored entity records (mirror of Spec V1 sez. 10 tables).

The DB schema is owned by Supabase migrations (workstream B); these Pydantic
records are the server-side representation used by repositories. No ORM
migrations are generated from these models (sez. 3.1).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.contracts.taxonomy import (
    BehaviorEventStatus,
    CareEventStatus,
    CareEventType,
    ConfidenceBand,
    ContextBucket,
    FeedbackValue,
    IntentCode,
    PatternState,
    RetentionState,
    SignalBehavior,
    SignalCategory,
    SignalExperimentStatus,
    SignalMapState,
)


class ProfileRec(BaseModel):
    user_id: str
    locale: str | None = None
    timezone: str | None = None
    created_at: datetime
    deleted_at: datetime | None = None


class DogRec(BaseModel):
    id: str
    owner_id: str
    name: str
    birth_date: str | None = None
    age_stage: str | None = None
    size: str | None = None
    breed_label: str | None = None
    is_mix: bool = False
    sex: str | None = None
    weight_kg: float | None = None
    photo_path: str | None = None
    created_at: datetime


class CareEventRec(BaseModel):
    id: str
    dog_id: str
    user_id: str
    event_type: CareEventType
    title: str
    scheduled_at: datetime
    all_day: bool = False
    timezone: str
    location: str | None = None
    notes: str | None = None
    reminder_enabled: bool = True
    reminder_minutes_before: int = 1440
    status: CareEventStatus = CareEventStatus.SCHEDULED
    completed_at: datetime | None = None
    reminder_sent_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SignalExperimentRec(BaseModel):
    id: str
    dog_id: str
    user_id: str
    client_request_id: str
    category: SignalCategory
    sound_key: str
    status: SignalExperimentStatus = SignalExperimentStatus.COMPLETED
    observed_behaviors: list[SignalBehavior] = Field(default_factory=list)
    reaction_latency_ms: int | None = None
    result_summary: str
    owner_feedback: FeedbackValue | None = None
    created_at: datetime


class SignalMapEntryRec(BaseModel):
    dog_id: str
    user_id: str
    category: SignalCategory
    state: SignalMapState = SignalMapState.DISCOVERING
    attempt_count: int = 0
    confirm_count: int = 0
    contradict_count: int = 0
    unknown_count: int = 0
    last_summary: str | None = None
    updated_at: datetime


class BehaviorCaptureRec(BaseModel):
    id: str
    dog_id: str
    user_id: str
    client_request_id: str
    storage_path: str
    duration_ms: int
    has_audio: bool = True
    bytes: int = 0
    content_type: str = "video/mp4"
    context_bucket: ContextBucket = ContextBucket.UNKNOWN
    retention_state: RetentionState = RetentionState.TEMPORARY
    expires_at: datetime | None = None
    upload_completed: bool = False
    created_at: datetime


class BehaviorEventRec(BaseModel):
    id: str
    capture_id: str
    dog_id: str
    user_id: str
    status: BehaviorEventStatus = BehaviorEventStatus.DRAFT
    primary_intent: IntentCode | None = None
    confidence_band: ConfidenceBand | None = None
    summary: str | None = None
    interpretation_json: dict[str, Any] | None = None
    observation_json: dict[str, Any] | None = None
    policy_version: str | None = None
    taxonomy_version: str | None = None
    quota_committed: bool = False
    quota_refunded: bool = False
    attempt_count: int = 0
    last_error_code: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class BehaviorFeedbackRec(BaseModel):
    event_id: str
    user_id: str
    value: FeedbackValue
    correction_label: IntentCode | None = None
    corrected_context: ContextBucket | None = None
    created_at: datetime
    updated_at: datetime


class PersonalPatternRec(BaseModel):
    id: str
    dog_id: str
    title: str
    state: PatternState = PatternState.CANDIDATE
    support_count: int = 0
    confirm_count: int = 0
    contradict_count: int = 0
    reliability_band: str = "low"
    version: int = 1
    first_seen: datetime | None = None
    last_seen: datetime | None = None


class FecalEventRec(BaseModel):
    id: str
    dog_id: str
    user_id: str
    client_request_id: str
    image_path: str
    bytes: int = 0
    content_type: str = "image/jpeg"
    status: str = "DRAFT"
    upload_completed: bool = False
    observation_json: dict[str, Any] | None = None
    fecal_score_estimate: int | None = None
    consistency: str | None = None
    color: str | None = None
    confidence_band: ConfidenceBand | None = None
    safety_flags: list[dict] = Field(default_factory=list)
    summary: str | None = None
    retention_state: RetentionState = RetentionState.TEMPORARY
    expires_at: datetime | None = None
    quota_committed: bool = False
    quota_refunded: bool = False
    created_at: datetime
    completed_at: datetime | None = None


class DogAlbumRec(BaseModel):
    id: str
    dog_id: str
    owner_id: str
    title: str
    cover_photo_id: str | None = None
    default_visibility: str = "PRIVATE"  # PRIVATE | PUBLISHED
    created_at: datetime


class DogPhotoRec(BaseModel):
    id: str
    album_id: str
    dog_id: str
    owner_id: str
    storage_path: str
    caption: str | None = None
    visibility: str = "PRIVATE"  # PRIVATE | PUBLISHED
    taken_at: datetime | None = None
    created_at: datetime
    deleted_at: datetime | None = None


class DogProfileVisibilityRec(BaseModel):
    dog_id: str
    visibility: str = "PRIVATE"  # PRIVATE | PUBLIC
    consent_version: str | None = None
    consented_at: datetime | None = None
    revoked_at: datetime | None = None
    public_slug: str | None = None
    whitelist_fields: list[str] = Field(
        default_factory=lambda: ["name", "breed_label", "age_stage", "size"]
    )
    updated_at: datetime


class FoodProductRec(BaseModel):
    id: str
    owner_id: str
    dog_id: str
    image_path: str | None = None
    client_request_id: str
    brand: str | None = None
    name: str | None = None
    ingredients_raw: str | None = None
    guaranteed_analysis: dict[str, Any] = Field(default_factory=dict)
    feeding_directions: str | None = None
    extraction_confidence: dict[str, float] = Field(default_factory=dict)
    verified_at: datetime | None = None
    created_at: datetime


class FeedingPeriodRec(BaseModel):
    id: str
    dog_id: str
    food_product_id: str
    start_at: datetime
    end_at: datetime | None = None
    quantity_per_day: str | None = None
    treats_notes: str | None = None
    transition_notes: str | None = None


class SubscriptionRec(BaseModel):
    user_id: str
    plan: str = "FREE"  # FREE / PREMIUM_MONTHLY / PREMIUM_ANNUAL
    status: str = "active"
    store: str | None = None
    product_id: str | None = None
    renews_at: datetime | None = None
    updated_at: datetime


class UsageLedgerRec(BaseModel):
    user_id: str
    behavior_limit: int
    behavior_used: int = 0
    behavior_reserved: int = 0
    digestive_limit: int
    digestive_used: int = 0
    digestive_reserved: int = 0
    reset_at: datetime


class DeviceInstallationRec(BaseModel):
    id: str
    user_id: str
    platform: str
    push_token: str
    app_version: str | None = None
    last_seen: datetime


class AnalysisJobRec(BaseModel):
    id: str
    job_type: str  # behavior_analysis / digestive_analysis / privacy_export / account_deletion
    event_id: str | None = None
    user_id: str | None = None
    status: str = "queued"
    attempt_count: int = 0
    last_error_code: str | None = None
    task_id: str | None = None
    created_at: datetime
    updated_at: datetime


class IdempotencyRec(BaseModel):
    """Idempotent request record (sez. 22): scoped per user + endpoint + key."""

    scope: str  # f"{user_id}:{endpoint}:{key}"
    status_code: int
    response_body: dict[str, Any]
    created_at: datetime
