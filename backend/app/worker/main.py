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


def _tokens_match(provided: str, expected: str) -> bool:
    if not expected:
        return False
    provided_b = provided.encode("utf-8")
    expected_b = expected.encode("utf-8")
    if len(provided_b) != len(expected_b):
        return False
    return hmac.compare_digest(provided_b, expected_b)


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return None
    return value.strip()


def create_worker_app(state: AppState | None = None) -> FastAPI:
    explicit_local_app = state is not None
    app = FastAPI(title="Dogly Private Worker", version="1.0.0", docs_url=None, openapi_url=None)
    app.state.cbi = state or build_default_state()

    def require_token(st: AppState, provided: str | None, expected: str) -> None:
        if (
            not expected
            and explicit_local_app
            and st.settings.app_env == "local"
            and not st.settings.worker_internal_token
            and not st.settings.cron_secret
        ):
            return
        if not provided or not _tokens_match(provided, expected):
            raise ApiError(
                ErrorCode.AUTH_REQUIRED,
                "Internal authentication required.",
            )

    async def worker_auth(
        request: Request,
        x_internal_token: Annotated[str | None, Header()] = None,
        authorization: Annotated[str | None, Header()] = None,
    ) -> None:
        st: AppState = request.app.state.cbi
        provided = x_internal_token or _bearer_token(authorization)
        require_token(st, provided, st.settings.worker_internal_token)

    async def cron_auth(
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
    ) -> None:
        st: AppState = request.app.state.cbi
        require_token(st, _bearer_token(authorization), st.settings.cron_secret)

    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=exc.http_status, content=exc.to_body().model_dump(mode="json"))

    @app.post("/tasks/run", dependencies=[Depends(worker_auth)])
    async def run_task(envelope: TaskEnvelope, request: Request) -> dict:
        st: AppState = request.app.state.cbi
        handler = TASK_HANDLERS.get(envelope.task_type)
        if handler is None:
            raise ApiError(ErrorCode.VALIDATION_FAILED, f"Unknown task type {envelope.task_type}")
        if envelope.task_type not in {"media_retention_cleanup", "care_reminder_dispatch"} and not envelope.event_id:
            raise ApiError(ErrorCode.VALIDATION_FAILED, "event_id is required for this task.")
        try:
            result = await handler(st, event_id=envelope.event_id)
        except handlers.RetryableTaskError as exc:
            from fastapi.responses import JSONResponse

            # A retryable failure answers non-2xx: the workflow step fails and
            # the platform retries with backoff (max_retries on the step). In
            # local mode there is no platform retry — the event is already
            # durably persisted as FAILED_RETRYABLE for a future sweep, and
            # the caller still gets an honest 503. Handlers are idempotent on
            # redelivery.
            return JSONResponse(status_code=503, content=exc.payload)
        return result

    @app.get("/tasks/cron/retention", dependencies=[Depends(cron_auth)])
    async def run_retention_cron(request: Request):
        """Vercel Cron GET ingress for expired raw media and storage orphans."""
        from fastapi.responses import JSONResponse

        st: AppState = request.app.state.cbi
        result = await handlers.process_media_retention_cleanup(st)
        status_code = int(result.get("http_status") or 200)
        if status_code != 200:
            return JSONResponse(status_code=status_code, content=result)
        return result

    @app.get("/tasks/cron/care-reminders", dependencies=[Depends(cron_auth)])
    async def run_care_reminder_cron(request: Request) -> dict:
        """Vercel Cron GET ingress for due care reminders."""
        st: AppState = request.app.state.cbi
        return await handlers.process_care_reminder_dispatch(st)

    return app


worker_app = create_worker_app()
