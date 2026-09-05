"""Repository layer.

Local/dev/test default: thread-safe in-memory store. Production wiring uses
SQLAlchemy 2 async against Supabase PostgreSQL via the pooler (sez. 2); the
schema itself is owned exclusively by Supabase migrations (sez. 3.1) — no ORM
DDL is ever emitted here.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from app.domains.models import (
    AnalysisJobRec,
    BehaviorCaptureRec,
    BehaviorEventRec,
    BehaviorFeedbackRec,
    CareEventRec,
    DeviceInstallationRec,
    DogAlbumRec,
    DogPhotoRec,
    DogProfileVisibilityRec,
    DogRec,
    FecalEventRec,
    FeedingPeriodRec,
    FoodProductRec,
    IdempotencyRec,
    PersonalPatternRec,
    ProfileRec,
    SignalExperimentRec,
    SignalMapEntryRec,
    SubscriptionRec,
    UsageLedgerRec,
)

# Plan allowances (sez. 21). Config-facing values; never exposed to UI as truth.
PLAN_ALLOWANCES: dict[str, dict[str, int]] = {
    "FREE": {"behavior": 3, "digestive": 3, "max_active_dogs": 1},
    "PREMIUM_MONTHLY": {"behavior": 30, "digestive": 30, "max_active_dogs": 1},
    "PREMIUM_ANNUAL": {"behavior": 30, "digestive": 30, "max_active_dogs": 1},
}


def now_utc() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return uuid.uuid4().hex


def next_month_reset() -> datetime:
    now = now_utc()
    if now.month == 12:
        return now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)


class InMemoryStore:
    """Mock repository used when DATABASE_URL is empty (local/dev/test).

    Mirrors the tables of sez. 10. Mutations go through asyncio-locked
    critical sections where atomicity matters (quota)."""

    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.profiles: dict[str, ProfileRec] = {}
        self.dogs: dict[str, DogRec] = {}
        self.captures: dict[str, BehaviorCaptureRec] = {}
        self.behavior_events: dict[str, BehaviorEventRec] = {}
        self.behavior_feedback: dict[str, BehaviorFeedbackRec] = {}
        self.care_events: dict[str, CareEventRec] = {}
        self.signal_experiments: dict[str, SignalExperimentRec] = {}
        self.signal_map_entries: dict[tuple[str, str], SignalMapEntryRec] = {}
        self.patterns: dict[str, PersonalPatternRec] = {}
        self.fecal_events: dict[str, FecalEventRec] = {}
        self.food_products: dict[str, FoodProductRec] = {}
        self.feeding_periods: dict[str, FeedingPeriodRec] = {}
        self.subscriptions: dict[str, SubscriptionRec] = {}
        self.usage_ledgers: dict[str, UsageLedgerRec] = {}
        self.devices: dict[str, DeviceInstallationRec] = {}
        self.analysis_jobs: dict[str, AnalysisJobRec] = {}
        self.idempotency: dict[str, IdempotencyRec] = {}
        self.webhook_events_seen: set[str] = set()
        self.export_jobs: dict[str, AnalysisJobRec] = {}
        self.deletion_jobs: dict[str, AnalysisJobRec] = {}
        self.dog_profile_versions: list[dict] = []
        self.dog_albums: dict[str, DogAlbumRec] = {}
        self.dog_photos: dict[str, DogPhotoRec] = {}
        self.dog_profile_visibility: dict[str, DogProfileVisibilityRec] = {}
        # Index: (user_id, client_request_id) -> capture/fecal id
        self.capture_by_client_request: dict[tuple[str, str], str] = {}
        self.fecal_by_client_request: dict[tuple[str, str], str] = {}
        self.food_by_client_request: dict[tuple[str, str], str] = {}

    # -- profile / subscription bootstrap -----------------------------------

    def ensure_profile(self, user_id: str) -> ProfileRec:
        if user_id not in self.profiles:
            self.profiles[user_id] = ProfileRec(user_id=user_id, created_at=now_utc())
        return self.profiles[user_id]

    def ensure_subscription(self, user_id: str) -> SubscriptionRec:
        if user_id not in self.subscriptions:
            self.subscriptions[user_id] = SubscriptionRec(user_id=user_id, updated_at=now_utc())
        return self.subscriptions[user_id]

    def ensure_ledger(self, user_id: str) -> UsageLedgerRec:
        """Create (or roll over) the usage ledger for the current period."""
        ledger = self.usage_ledgers.get(user_id)
        now = now_utc()
        if ledger is None or ledger.reset_at <= now:
            plan = self.ensure_subscription(user_id).plan
            limits = PLAN_ALLOWANCES.get(plan, PLAN_ALLOWANCES["FREE"])
            ledger = UsageLedgerRec(
                user_id=user_id,
                behavior_limit=limits["behavior"],
                digestive_limit=limits["digestive"],
                reset_at=next_month_reset(),
            )
            self.usage_ledgers[user_id] = ledger
        return ledger

    # -- dogs -----------------------------------------------------------------

    def create_dog(self, rec: DogRec) -> DogRec:
        self.dogs[rec.id] = rec
        return rec

    def list_dogs(self, owner_id: str) -> list[DogRec]:
        return sorted(
            (d for d in self.dogs.values() if d.owner_id == owner_id),
            key=lambda d: (d.created_at, d.id),
        )

    def get_dog(self, dog_id: str) -> DogRec | None:
        return self.dogs.get(dog_id)

    def save_profile_version(self, dog_id: str, snapshot: dict, changed_fields: list[str]) -> None:
        self.dog_profile_versions.append(
            {
                "id": new_id(),
                "dog_id": dog_id,
                "snapshot": snapshot,
                "changed_fields": changed_fields,
                "created_at": now_utc(),
            }
        )
