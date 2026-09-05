"""Privacy routes (sez. 9 / 23.3): export + account deletion."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import (
    DeleteAccountRequest,
    DeleteAccountResponse,
    PrivacyExportResponse,
    PrivacyExportStatusResponse,
)
from app.contracts.errors import ApiError, ErrorCode
from app.domains import privacy as privacy_domain
from app.domains import privacy_db

router = APIRouter()


@router.post("/privacy/export", response_model=PrivacyExportResponse, status_code=202)
async def start_export(state: StateDep, user_id: UserIdDep) -> PrivacyExportResponse:
    if state.engine is not None:
        job = await privacy_db.start_export(state.engine, user_id)
    else:
        job = privacy_domain.start_export(state.store, user_id=user_id)
    task_id = await state.queue.enqueue(
        task_type="privacy_export",
        payload={"event_id": job.id, "user_id": user_id},
    )
    job.task_id = task_id
    return PrivacyExportResponse(export_job_id=job.id, status=job.status)


@router.post("/privacy/delete-account", response_model=DeleteAccountResponse, status_code=202)
async def delete_account(
    payload: DeleteAccountRequest, state: StateDep, user_id: UserIdDep
) -> DeleteAccountResponse:
    if payload.confirm != "DELETE_MY_ACCOUNT":
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Deletion confirmation is required.")
    if state.engine is not None:
        job = await privacy_db.start_account_deletion(state.engine, user_id)
    else:
        job = privacy_domain.start_account_deletion(state.store, user_id=user_id)
    task_id = await state.queue.enqueue(
        task_type="account_deletion",
        payload={"event_id": job.id, "user_id": user_id},
    )
    job.task_id = task_id
    return DeleteAccountResponse(deletion_job_id=job.id, status=job.status)


@router.get("/privacy/export/{job_id}", response_model=PrivacyExportStatusResponse)
async def export_status(
    job_id: str, state: StateDep, user_id: UserIdDep
) -> PrivacyExportStatusResponse:
    if state.engine is not None:
        job = await privacy_db.get_export_job(state.engine, user_id=user_id, job_id=job_id)
    else:
        job = privacy_domain.get_export_job(state.store, user_id=user_id, job_id=job_id)

    download_url = None
    expires_at = job.expires_at
    if job.status == "completed" and job.storage_path:
        create_read = getattr(state.storage, "create_signed_read_url", None)
        if callable(create_read):
            try:
                download_url = await create_read(
                    bucket="exports",
                    path=job.storage_path,
                    ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 3600),
                )
            except Exception:  # noqa: BLE001 -- export read URL is best-effort
                download_url = None
        if expires_at is None:
            expires_at = datetime.now(UTC) + timedelta(days=7)
    return PrivacyExportStatusResponse(
        export_job_id=job.id,
        status=job.status,
        download_url=download_url,
        expires_at=expires_at,
    )
