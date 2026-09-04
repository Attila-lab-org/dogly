"""Privacy routes (sez. 9 / 23.3): export + account deletion."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
from app.contracts.api import (
    DeleteAccountRequest,
    DeleteAccountResponse,
    PrivacyExportResponse,
)
from app.domains import privacy as privacy_domain

router = APIRouter()


@router.post("/privacy/export", response_model=PrivacyExportResponse, status_code=202)
async def start_export(state: StateDep, user_id: UserIdDep) -> PrivacyExportResponse:
    job = privacy_domain.start_export(state.store, user_id=user_id)
    return PrivacyExportResponse(export_job_id=job.id, status=job.status)


@router.post("/privacy/delete-account", response_model=DeleteAccountResponse, status_code=202)
async def delete_account(
    payload: DeleteAccountRequest, state: StateDep, user_id: UserIdDep
) -> DeleteAccountResponse:
    job = privacy_domain.start_account_deletion(state.store, user_id=user_id)
    return DeleteAccountResponse(deletion_job_id=job.id, status=job.status)
