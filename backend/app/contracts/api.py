"""Public API request/response schemas — V1 contract (Spec V1 sez. 9).

FastAPI/Pydantic is the source of truth for public contracts (sez. 3.1).
No endpoint accepts owner_id/user_id from the client as authority (sez. 9.1).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.contracts.interpretation import AlternativeIntent, EvidenceItem, SafetyFlag
from app.contracts.taxonomy import (
    AnalysisDomain,
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

# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------


class CursorPage(BaseModel):
    """Cursor pagination envelope (sez. 9.1: no offset pagination)."""

    next_cursor: str | None = None


class UsageDomain(BaseModel):
    limit: int
    used: int
    reserved: int


class UsageLedger(BaseModel):
    behavior: UsageDomain
    digestive: UsageDomain
    reset_at: datetime


# ---------------------------------------------------------------------------
# /v1/me, subscription, usage
# ---------------------------------------------------------------------------


class ProfileOut(BaseModel):
    user_id: str
    locale: str | None = None
    timezone: str | None = None
    created_at: datetime


class PlanOut(BaseModel):
    plan: Literal["FREE", "PREMIUM_MONTHLY", "PREMIUM_ANNUAL"]
    status: str = "active"
    renews_at: datetime | None = None
    max_active_dogs: int = 1


class MeResponse(BaseModel):
    profile: ProfileOut
    plan: PlanOut
    usage: UsageLedger
    feature_availability: dict[str, bool] = Field(default_factory=dict)


class SubscriptionStatusResponse(BaseModel):
    plan: PlanOut
    entitlement_source: str = "revenuecat_mirror"
    limits: UsageLedger


class UsageResponse(BaseModel):
    ledger: UsageLedger


# ---------------------------------------------------------------------------
# Dogs
# ---------------------------------------------------------------------------


class DogCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    birth_date: str | None = None
    age_stage: str | None = None
    size: str | None = None
    breed_label: str | None = None
    is_mix: bool = False
    sex: str | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    client_request_id: str | None = None


class DogUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    birth_date: str | None = None
    age_stage: str | None = None
    size: str | None = None
    breed_label: str | None = None
    is_mix: bool | None = None
    sex: str | None = None
    weight_kg: float | None = Field(default=None, gt=0)


class DogOut(BaseModel):
    id: str
    name: str
    birth_date: str | None = None
    age_stage: str | None = None
    size: str | None = None
    breed_label: str | None = None
    is_mix: bool = False
    sex: str | None = None
    weight_kg: float | None = None
    photo_path: str | None = None
    photo_url: str | None = None
    created_at: datetime


class DogListResponse(CursorPage):
    items: list[DogOut]


# ---------------------------------------------------------------------------
# Care agenda
# ---------------------------------------------------------------------------


class CareEventCreate(BaseModel):
    event_type: CareEventType
    title: str = Field(min_length=1, max_length=120)
    scheduled_at: datetime
    all_day: bool = False
    timezone: str = Field(default="Europe/Rome", min_length=1, max_length=64)
    location: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    reminder_enabled: bool = True
    reminder_minutes_before: int = Field(default=1440, ge=0, le=525600)


class CareEventUpdate(BaseModel):
    event_type: CareEventType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    scheduled_at: datetime | None = None
    all_day: bool | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    location: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    reminder_enabled: bool | None = None
    reminder_minutes_before: int | None = Field(default=None, ge=0, le=525600)
    status: CareEventStatus | None = None


class CareEventOut(BaseModel):
    id: str
    dog_id: str
    event_type: CareEventType
    title: str
    scheduled_at: datetime
    all_day: bool
    timezone: str
    location: str | None = None
    notes: str | None = None
    reminder_enabled: bool
    reminder_minutes_before: int
    status: CareEventStatus
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CareEventListResponse(CursorPage):
    items: list[CareEventOut]


# ---------------------------------------------------------------------------
# Dogly Signals
# ---------------------------------------------------------------------------


class SignalExperimentCreate(BaseModel):
    client_request_id: str = Field(min_length=8, max_length=128)
    category: SignalCategory
    sound_key: str = Field(min_length=1, max_length=80)
    observed_behaviors: list[SignalBehavior] = Field(min_length=1, max_length=5)
    reaction_latency_ms: int | None = Field(default=None, ge=0, le=10000)
    owner_feedback: FeedbackValue | None = None

    @model_validator(mode="after")
    def no_response_is_exclusive(self) -> SignalExperimentCreate:
        if (
            SignalBehavior.NO_VISIBLE_RESPONSE in self.observed_behaviors
            and len(self.observed_behaviors) > 1
        ):
            raise ValueError("NO_VISIBLE_RESPONSE cannot be combined with other behaviors")
        return self


class SignalExperimentOut(BaseModel):
    id: str
    dog_id: str
    category: SignalCategory
    sound_key: str
    status: SignalExperimentStatus
    observed_behaviors: list[SignalBehavior] = Field(default_factory=list)
    reaction_latency_ms: int | None = None
    result_summary: str
    owner_feedback: FeedbackValue | None = None
    created_at: datetime


class SignalMapEntryOut(BaseModel):
    dog_id: str
    category: SignalCategory
    state: SignalMapState
    attempt_count: int
    confirm_count: int
    contradict_count: int
    unknown_count: int
    last_summary: str | None = None
    updated_at: datetime


class SignalMapResponse(BaseModel):
    items: list[SignalMapEntryOut]
    next_category: SignalCategory = SignalCategory.ATTENTION


class SignalExperimentListResponse(CursorPage):
    items: list[SignalExperimentOut]


# ---------------------------------------------------------------------------
# Behavior capture / events / feedback
# ---------------------------------------------------------------------------


class BehaviorCaptureInitRequest(BaseModel):
    dog_id: str
    client_request_id: str = Field(min_length=8, max_length=128)
    duration_ms: int = Field(gt=0)
    has_audio: bool = True
    bytes: int = Field(gt=0)
    content_type: str = "video/mp4"
    context_bucket: ContextBucket = ContextBucket.UNKNOWN


class SignedUpload(BaseModel):
    url: str
    storage_path: str
    expires_at: datetime


class DogAvatarInitRequest(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = "image/jpeg"
    bytes: int = Field(gt=0, le=8_000_000)


class DogAvatarInitResponse(BaseModel):
    storage_path: str
    upload: SignedUpload


class DogAvatarCompleteRequest(BaseModel):
    storage_path: str = Field(min_length=8, max_length=512)
    bytes: int | None = Field(default=None, gt=0, le=8_000_000)


class BehaviorCaptureInitResponse(BaseModel):
    capture_id: str
    event_id: str
    status: BehaviorEventStatus
    upload: SignedUpload
    quota_reserved: bool = True


class CaptureCompleteResponse(BaseModel):
    capture_id: str
    event_id: str
    status: BehaviorEventStatus


class BehaviorEventOut(BaseModel):
    id: str
    dog_id: str
    status: BehaviorEventStatus
    primary_intent: IntentCode | None = None
    confidence_band: ConfidenceBand | None = None
    summary: str | None = None
    alternatives: list[AlternativeIntent] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    safety_flags: list[SafetyFlag] = Field(default_factory=list)
    needs_context: bool = False
    context_question: str | None = None
    policy_version: str | None = None
    taxonomy_version: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class BehaviorFeedbackRequest(BaseModel):
    value: FeedbackValue
    correction_label: IntentCode | None = None
    corrected_context: ContextBucket | None = None
    client_request_id: str | None = None


class BehaviorFeedbackResponse(BaseModel):
    event_id: str
    value: FeedbackValue
    recorded: bool = True


# ---------------------------------------------------------------------------
# Diary
# ---------------------------------------------------------------------------


class DiaryItem(BaseModel):
    id: str
    domain: AnalysisDomain
    dog_id: str
    status: str
    title: str
    summary: str | None = None
    retention_state: RetentionState = RetentionState.TEMPORARY
    created_at: datetime


class DiaryPage(CursorPage):
    items: list[DiaryItem]


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------


class PatternOut(BaseModel):
    id: str
    dog_id: str
    title: str
    state: PatternState
    reliability_band: str
    support_count: int
    version: int
    last_seen: datetime | None = None


class PatternListResponse(BaseModel):
    items: list[PatternOut]


class PatternReviewRequest(BaseModel):
    action: Literal["contest", "archive", "correct_context"]
    corrected_context: ContextBucket | None = None
    note: str | None = None


class PatternReviewResponse(BaseModel):
    pattern_id: str
    state: PatternState
    recorded: bool = True


# ---------------------------------------------------------------------------
# Digestive / nutrition
# ---------------------------------------------------------------------------


class FecalInitRequest(BaseModel):
    dog_id: str
    client_request_id: str = Field(min_length=8, max_length=128)
    bytes: int = Field(gt=0)
    content_type: str = "image/jpeg"


class FecalInitResponse(BaseModel):
    event_id: str
    status: str
    upload: SignedUpload
    quota_reserved: bool = True


class FecalCompleteResponse(BaseModel):
    event_id: str
    status: str


class DigestiveEventOut(BaseModel):
    id: str
    dog_id: str
    status: str
    fecal_score_estimate: int | None = None
    consistency: str | None = None
    color: str | None = None
    confidence_band: ConfidenceBand | None = None
    safety_flags: list[SafetyFlag] = Field(default_factory=list)
    summary: str | None = None
    created_at: datetime


class FoodScanInitRequest(BaseModel):
    dog_id: str
    client_request_id: str = Field(min_length=8, max_length=128)
    bytes: int = Field(gt=0)
    content_type: str = "image/jpeg"


class FoodScanInitResponse(BaseModel):
    food_product_id: str
    upload: SignedUpload
    ocr_status: str = "pending"


class GuaranteedAnalysis(BaseModel):
    """Guaranteed-analysis schema (sez. 20.2). Percentages nullable."""

    crude_protein_min: float | None = None
    crude_fat_min: float | None = None
    crude_fiber_max: float | None = None
    moisture_max: float | None = None
    calories: str | None = None


class FoodVerifyRequest(BaseModel):
    """Only user-verified fields become durable data (sez. 20.1)."""

    brand: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    ingredients_raw: str | None = None
    guaranteed_analysis: GuaranteedAnalysis = Field(default_factory=GuaranteedAnalysis)
    feeding_directions: str | None = None


class FoodProductOut(BaseModel):
    id: str
    brand: str | None = None
    name: str | None = None
    verified_at: datetime | None = None


class FeedingPeriodCreate(BaseModel):
    dog_id: str
    food_product_id: str
    start_at: datetime
    quantity_per_day: str | None = None
    treats_notes: str | None = None
    transition_notes: str | None = None
    client_request_id: str | None = None


class FeedingPeriodOut(BaseModel):
    id: str
    dog_id: str
    food_product_id: str
    start_at: datetime
    end_at: datetime | None = None


class DigestiveSummaryOut(BaseModel):
    dog_id: str
    rolling_score: float | None = None
    variability: float | None = None
    data_sufficiency: str = "insufficient"
    recent_trend: str | None = None
    safety_flags: list[SafetyFlag] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Devices / webhooks / privacy
# ---------------------------------------------------------------------------


class PushTokenRequest(BaseModel):
    platform: Literal["ios", "android"]
    push_token: str = Field(min_length=8, max_length=512)
    app_version: str | None = None


class PushTokenResponse(BaseModel):
    registered: bool = True


class RevenueCatWebhookResponse(BaseModel):
    processed: bool
    duplicate: bool = False


class PrivacyExportResponse(BaseModel):
    export_job_id: str
    status: str = "queued"


class PrivacyExportStatusResponse(BaseModel):
    export_job_id: str
    status: str
    download_url: str | None = None
    expires_at: datetime | None = None


class DeleteAccountRequest(BaseModel):
    confirm: Literal["DELETE_MY_ACCOUNT"]


class DeleteAccountResponse(BaseModel):
    deletion_job_id: str
    status: str = "pending"


# ---------------------------------------------------------------------------
# Gallery / profile visibility (Dogly UX V1)
# ---------------------------------------------------------------------------


class DogAlbumCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    default_visibility: Literal["PRIVATE", "PUBLISHED"] = "PRIVATE"


class DogAlbumOut(BaseModel):
    id: str
    dog_id: str
    title: str
    cover_photo_id: str | None = None
    photo_count: int = 0
    default_visibility: Literal["PRIVATE", "PUBLISHED"] = "PRIVATE"
    created_at: datetime


class DogAlbumListResponse(BaseModel):
    items: list[DogAlbumOut]


class DogPhotoInitRequest(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = "image/jpeg"
    bytes: int = Field(gt=0, le=15_000_000)
    caption: str | None = Field(default=None, max_length=280)
    visibility: Literal["PRIVATE", "PUBLISHED"] | None = None
    taken_at: datetime | None = None


class DogPhotoUpdate(BaseModel):
    caption: str | None = Field(default=None, max_length=280)
    visibility: Literal["PRIVATE", "PUBLISHED"] | None = None


class DogPhotoOut(BaseModel):
    id: str
    album_id: str
    dog_id: str
    storage_path: str
    caption: str | None = None
    visibility: Literal["PRIVATE", "PUBLISHED"] = "PRIVATE"
    taken_at: datetime | None = None
    created_at: datetime


class DogPhotoListResponse(BaseModel):
    items: list[DogPhotoOut]


class DogPhotoUploadResponse(BaseModel):
    photo: DogPhotoOut
    upload: dict


class DogProfileVisibilityUpdate(BaseModel):
    visibility: Literal["PRIVATE", "PUBLIC"]
    consent_version: str | None = None
    public_slug: str | None = Field(default=None, max_length=64)
    whitelist_fields: list[str] | None = None


class DogProfileVisibilityOut(BaseModel):
    dog_id: str
    visibility: Literal["PRIVATE", "PUBLIC"] = "PRIVATE"
    consent_version: str | None = None
    consented_at: datetime | None = None
    revoked_at: datetime | None = None
    public_slug: str | None = None
    whitelist_fields: list[str] = Field(
        default_factory=lambda: ["name", "breed_label", "age_stage", "size"]
    )
