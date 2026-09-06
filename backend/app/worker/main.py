"""Private worker HTTP surface (Spec V1 sez. 8.2 + SPEC_AMENDMENT_V1.1).

V1 runs on Vercel: this app serves the internal workflow routes invoked by
Vercel Workflows (durable, retryable, push-based jobs). There is no public
ingress for these routes: every call must carry the shared
``WORKER_INTERNAL_TOKEN`` secret (header ``x-internal-token``); in local mode
an empty token means open (local dev only). Task payloads are IDs only
(sez. 22).

Future scaling path (documented only, not V1): the same surface can be
fronted by Cloud Tasks OIDC identity without changing the handlers.
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, FastAPI, Header, Request
from pydantic import BaseModel

from app.api.deps import AppState, build_default_state
from app.contracts.errors import ApiError, ErrorCode
from app.worker import handlers

TASK_HANDLERS = {
    "behavior_analysis": handlers.process_behavior_event,
    "digestive_analysis": handlers.process_digestive_event,
    "media_retention_cleanup": handlers.process_media_retention_cleanup,
    "care_reminder_dispatch": handlers.process_care_reminder_dispatch,
    "behavior_result_notification": handlers.process_behavior_result_notification,
    "digestive_result_notification": handlers.process_digestive_result_notification,
    "privacy_export": handlers.process_privacy_export,
    "account_deletion": handlers.process_account_deletion,
}


class TaskEnvelope(BaseModel):
    """Workflow push payload: IDs only, no media bytes, no secrets (sez. 22)."""

    task_type: str
    event_id: str | None = None


def create_worker_app(state: AppState | None = None) -> FastAPI:
    app = FastAPI(title="Dogly Private Worker", version="1.0.0", docs_url=None, openapi_url=None)
    app.state.cbi = state or build_default_state()

    async def internal_auth(
        request: Request,
        x_internal_token: Annotated[str | None, Header()] = None,
    ) -> None:
        st: AppState = request.app.state.cbi
        expected = st.settings.worker_internal_token
        if not expected:
            return  # local dev mode
        if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
            raise ApiError(ErrorCode.AUTH_REQUIRED, "Internal authentication required.")

    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=exc.http_status, content=exc.to_body().model_dump(mode="json"))

    @app.post("/tasks/run", dependencies=[Depends(internal_auth)])
    async def run_task(envelope: TaskEnvelope, request: Request) -> dict:
        st: AppState = request.app.state.cbi
        handler = TASK_HANDLERS.get(envelope.task_type)
        if handler is None:
            raise ApiError(ErrorCode.VALIDATION_FAILED, f"Unknown task type {envelope.task_type}")
        if envelope.task_type in {"media_retention_cleanup", "care_reminder_dispatch"}:
            result = await handler(st, event_id=envelope.event_id)
        else:
            if not envelope.event_id:
                raise ApiError(ErrorCode.VALIDATION_FAILED, "event_id is required for this task.")
            result = await handler(st, event_id=envelope.event_id)
        # Non-2xx fails the workflow run and the platform retries with
        # backoff; FAILED_RETRYABLE is signaled explicitly in the result so
        # the caller can re-enqueue. Handlers are idempotent on redelivery.
        return result

    return app


worker_app = create_worker_app()
