"""Privacy domain service (Spec V1 sez. 23): export & deletion workflows.

Export/delete are asynchronous, retryable, auditable jobs (internal schema).
Deletion never retains raw content in logs.
"""

from __future__ import annotations

from typing import Any

from app.contracts.errors import ApiError, ErrorCode
from app.domains.models import AnalysisJobRec
from app.domains.repository import InMemoryStore, new_id, now_utc


def start_export(store: InMemoryStore, *, user_id: str) -> AnalysisJobRec:
    """Start a data export job (sez. 23.3). One active export per user."""
    for job in store.export_jobs.values():
        if job.user_id == user_id and job.status in ("queued", "running"):
            return job  # idempotent
    job = AnalysisJobRec(
        id=new_id(),
        job_type="privacy_export",
        user_id=user_id,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store.export_jobs[job.id] = job
    return job


def start_account_deletion(store: InMemoryStore, *, user_id: str) -> AnalysisJobRec:
    """Begin deletion workflow (sez. 23.3): immediate access revocation +
    asynchronous purge with completion state."""
    profile = store.profiles.get(user_id)
    if profile is not None and profile.deleted_at is not None:
        existing = next(
            (j for j in store.deletion_jobs.values() if j.user_id == user_id), None
        )
        if existing:
            return existing
        raise ApiError(ErrorCode.INVALID_STATE, "Account deletion already in progress.")
    if profile is not None:
        profile.deleted_at = now_utc()  # immediate access revocation
    job = AnalysisJobRec(
        id=new_id(),
        job_type="account_deletion",
        user_id=user_id,
        status="pending",
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store.deletion_jobs[job.id] = job
    return job


def claim_export_job(store: InMemoryStore, job_id: str) -> AnalysisJobRec | None:
    job = store.export_jobs.get(job_id)
    if job is None or job.status not in ("queued", "failed"):
        return None
    job.status = "running"
    job.attempt_count += 1
    job.updated_at = now_utc()
    return job


def complete_export_job(
    store: InMemoryStore,
    job_id: str,
    *,
    storage_path: str | None = None,
    expires_at=None,
) -> None:
    if job := store.export_jobs.get(job_id):
        job.status = "completed"
        job.updated_at = now_utc()
        if storage_path is not None:
            job.storage_path = storage_path
        if expires_at is not None:
            job.expires_at = expires_at


def get_export_job(store: InMemoryStore, *, user_id: str, job_id: str) -> AnalysisJobRec:
    job = store.export_jobs.get(job_id)
    if job is None or job.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Export not found.")
    return job


def fail_export_job(store: InMemoryStore, job_id: str, error: str) -> None:
    if job := store.export_jobs.get(job_id):
        job.status = "failed"
        job.last_error_code = error[:120]
        job.updated_at = now_utc()


def claim_deletion_job(store: InMemoryStore, job_id: str) -> AnalysisJobRec | None:
    job = store.deletion_jobs.get(job_id)
    if job is None or job.status not in ("queued", "pending", "failed"):
        return None
    job.status = "running"
    job.attempt_count += 1
    job.updated_at = now_utc()
    return job


def complete_deletion_job(store: InMemoryStore, job_id: str) -> None:
    if job := store.deletion_jobs.get(job_id):
        job.status = "completed"
        job.updated_at = now_utc()


def fail_deletion_job(store: InMemoryStore, job_id: str, error: str) -> None:
    if job := store.deletion_jobs.get(job_id):
        job.status = "failed"
        job.last_error_code = error[:120]
        job.updated_at = now_utc()


def collect_export_payload(store: InMemoryStore, user_id: str) -> dict[str, Any]:
    """Collect exportable user data without raw media bytes."""
    dog_ids = {dog.id for dog in store.dogs.values() if dog.owner_id == user_id}
    return {
        "user_id": user_id,
        "generated_at": now_utc().isoformat(),
        "profiles": [
            rec.model_dump(mode="json")
            for rec in store.profiles.values()
            if rec.user_id == user_id
        ],
        "dogs": [
            rec.model_dump(mode="json")
            for rec in store.dogs.values()
            if rec.owner_id == user_id
        ],
        "behavior_events": [
            rec.model_dump(
                mode="json",
                exclude={"observation_json", "interpretation_json"},
            )
            for rec in store.behavior_events.values()
            if rec.user_id == user_id
        ],
        "behavior_feedback": [
            rec.model_dump(mode="json")
            for rec in store.behavior_feedback.values()
            if rec.user_id == user_id
        ],
        "personal_patterns": [
            rec.model_dump(mode="json")
            for rec in store.patterns.values()
            if rec.dog_id in dog_ids
        ],
        "fecal_events": [
            rec.model_dump(mode="json", exclude={"bytes", "observation_json"})
            for rec in store.fecal_events.values()
            if rec.user_id == user_id
        ],
        "food_products": [
            rec.model_dump(mode="json", exclude={"image_path"})
            for rec in store.food_products.values()
            if rec.owner_id == user_id
        ],
        "feeding_periods": [
            rec.model_dump(mode="json")
            for rec in store.feeding_periods.values()
            if rec.dog_id in dog_ids
        ],
        "consents": [
            row for row in store.user_consents if row["user_id"] == user_id
        ],
        "lifestyle_profiles": [
            {"dog_id": dog_id, **profile}
            for dog_id, profile in store.dog_lifestyle_profiles.items()
            if dog_id in dog_ids
        ],
        "advice_outcomes": [
            row for row in store.advice_outcomes if row["user_id"] == user_id
        ],
        "subscriptions": [
            rec.model_dump(mode="json")
            for rec in store.subscriptions.values()
            if rec.user_id == user_id
        ],
    }


def list_storage_paths_for_user(store: InMemoryStore, user_id: str) -> list[dict[str, str]]:
    paths: list[dict[str, str]] = []
    for dog in store.dogs.values():
        if dog.owner_id == user_id and dog.photo_path:
            paths.append({"bucket": "dog-avatars", "path": dog.photo_path})
    for capture in store.captures.values():
        if capture.user_id == user_id and capture.storage_path:
            paths.append({"bucket": "behavior-raw", "path": capture.storage_path})
    for event in store.fecal_events.values():
        if event.user_id == user_id and event.image_path:
            paths.append({"bucket": "digestive-raw", "path": event.image_path})
    for product in store.food_products.values():
        if product.owner_id == user_id and product.image_path:
            paths.append({"bucket": "food-labels", "path": product.image_path})
    for photo in store.dog_photos.values():
        if photo.owner_id == user_id and photo.storage_path:
            paths.append({"bucket": "dog-gallery", "path": photo.storage_path})
    return paths
