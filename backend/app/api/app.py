"""Public FastAPI application factory (Spec V1 sez. 8.1 / 9)."""

from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.deps import AppState, build_default_state
from app.api.routes import (
    behavior,
    care,
    devices,
    diary,
    digestive,
    dogs,
    gallery,
    me,
    nutrition,
    patterns,
    privacy,
    signals,
    subscription,
    webhooks,
)
from app.contracts.errors import ApiError, ErrorBody, ErrorCode
from app.observability import init_sentry


def create_app(state: AppState | None = None) -> FastAPI:
    app = FastAPI(
        title="Dogly API",
        version="1.0.0",
        description="Public API V1 (Spec V1 sez. 9). OpenAPI is the mobile client contract.",
    )
    resolved = state or build_default_state()
    init_sentry(resolved.settings)
    app.state.cbi = resolved

    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.http_status, content=exc.to_body().model_dump(mode="json"))

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        body = ErrorBody(
            code=ErrorCode.VALIDATION_FAILED,
            message="Request failed validation.",
            retryable=False,
            correlation_id=uuid.uuid4().hex,
        )
        return JSONResponse(status_code=422, content=body.model_dump(mode="json"))

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
        # Never expose provider/internal stack traces (sez. 9.1 / 24.1).
        body = ErrorBody(
            code=ErrorCode.INTERNAL_ERROR,
            message="An internal error occurred.",
            retryable=False,
            correlation_id=uuid.uuid4().hex,
        )
        return JSONResponse(status_code=500, content=body.model_dump(mode="json"))

    app.include_router(me.router, prefix="/v1", tags=["me"])
    app.include_router(dogs.router, prefix="/v1", tags=["dogs"])
    app.include_router(gallery.router, prefix="/v1", tags=["gallery"])
    app.include_router(care.router, prefix="/v1", tags=["care-agenda"])
    app.include_router(behavior.router, prefix="/v1", tags=["behavior"])
    app.include_router(diary.router, prefix="/v1", tags=["diary"])
    app.include_router(patterns.router, prefix="/v1", tags=["patterns"])
    app.include_router(signals.router, prefix="/v1", tags=["dogly-signals"])
    app.include_router(digestive.router, prefix="/v1", tags=["digestive"])
    app.include_router(nutrition.router, prefix="/v1", tags=["nutrition"])
    app.include_router(subscription.router, prefix="/v1", tags=["subscription", "usage"])
    app.include_router(devices.router, prefix="/v1", tags=["devices"])
    app.include_router(privacy.router, prefix="/v1", tags=["privacy"])
    app.include_router(webhooks.router, prefix="/v1", tags=["webhooks"])
    return app


app = create_app()
