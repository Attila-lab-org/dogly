"""Privacy domain service (Spec V1 sez. 23): export & deletion workflows.

Export/delete are asynchronous, retryable, auditable jobs (internal schema).
Deletion never retains raw content in logs.
"""

from __future__ import annotations

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
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store.deletion_jobs[job.id] = job
    return job
