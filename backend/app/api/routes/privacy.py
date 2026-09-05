"""Privacy routes (sez. 9 / 23.3): export + account deletion."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import (
    DeleteAccountRequest,
    DeleteAccountResponse,
    PrivacyExportResponse,
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
