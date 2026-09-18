"""Public FastAPI application factory (Spec V1 sez. 8.1 / 9)."""

from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.api.deps import AppState, build_default_state
from app.api.routes import (
    advice,
    behavior,
    care,
    devices,
    diary,
    digestive,
    dogs,
    gallery,
    me,
    nutrition,
    owner_stories,
    patterns,
    privacy,
    realtime,
    signals,
    subscription,
    webhooks,
)
from app.contracts.errors import ApiError, ErrorBody, ErrorCode
from app.observability import init_sentry
from app.observability.request_context import get_request_id
from app.observability.request_id_asgi import RequestIdMiddleware

logger = logging.getLogger("dogly.api")


def _map_database_error(exc: BaseException) -> ApiError | None:
    message = str(getattr(exc, "orig", exc)).lower()
    if "invalid uuid" in message or "invalid input syntax for type uuid" in message or (
        "invalid input for query argument" in message and "uuid" in message
    ):
        return ApiError(ErrorCode.NOT_FOUND, "Resource not found")
    if "check violation" in message or "check constraint" in message:
        return ApiError(ErrorCode.VALIDATION_FAILED, "Request failed validation.")
    if "media_keep_requires_consent" in message:
        return ApiError(
            ErrorCode.VALIDATION_FAILED,
            "Media can only be kept after the retention consent is granted.",
        )
    return None


def create_app(state: AppState | None = None) -> FastAPI:
    app = FastAPI(
        title="Dogly API",
        version="1.0.0",
        description="Public API V1 (Spec V1 sez. 9). OpenAPI is the mobile client contract.",
    )
    resolved = state or build_default_state()
    init_sentry(resolved.settings)
    app.state.cbi = resolved
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            origin.strip()
            for origin in resolved.settings.cors_origins.split(",")
            if origin.strip()
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # FIX 1.7: pure ASGI middleware (not BaseHTTPMiddleware) so background
    # asyncio.create_task dispatchers are not forced to complete before the
    # response returns.
    app.add_middleware(RequestIdMiddleware)

    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        # Use the request id as correlation_id when available (FIX 1.7);
        # fall back to the exception's own id for non-request contexts.
        rid = get_request_id()
        body = exc.to_body()
        if rid:
            body = body.model_copy(update={"correlation_id": rid})
        return JSONResponse(status_code=exc.http_status, content=body.model_dump(mode="json"))

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        body = ErrorBody(
            code=ErrorCode.VALIDATION_FAILED,
            message="Request failed validation.",
            retryable=False,
            correlation_id=get_request_id() or uuid.uuid4().hex,
        )
        return JSONResponse(status_code=422, content=body.model_dump(mode="json"))

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(_: Request, exc: IntegrityError) -> JSONResponse:
        mapped = _map_database_error(exc)
        if mapped is not None:
            return JSONResponse(
                status_code=mapped.http_status,
                content=mapped.to_body().model_dump(mode="json"),
            )
        return await unhandled_error_handler(_, exc)

    @app.exception_handler(DBAPIError)
    async def dbapi_error_handler(_: Request, exc: DBAPIError) -> JSONResponse:
        mapped = _map_database_error(exc)
        if mapped is not None:
            return JSONResponse(
                status_code=mapped.http_status,
                content=mapped.to_body().model_dump(mode="json"),
            )
        return await unhandled_error_handler(_, exc)

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
        # Never expose provider/internal stack traces (sez. 9.1 / 24.1).
        logger.exception("Unhandled API error")
        try:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        except ImportError:
            logger.debug("sentry-sdk not installed; skipping capture")
        body = ErrorBody(
            code=ErrorCode.INTERNAL_ERROR,
            message="An internal error occurred.",
            retryable=False,
            correlation_id=get_request_id() or uuid.uuid4().hex,
        )
        return JSONResponse(status_code=500, content=body.model_dump(mode="json"))

    app.include_router(me.router, prefix="/v1", tags=["me"])
    app.include_router(advice.router, prefix="/v1", tags=["advice"])
    app.include_router(dogs.router, prefix="/v1", tags=["dogs"])
    app.include_router(gallery.router, prefix="/v1", tags=["gallery"])
    app.include_router(care.router, prefix="/v1", tags=["care-agenda"])
    app.include_router(behavior.router, prefix="/v1", tags=["behavior"])
    app.include_router(diary.router, prefix="/v1", tags=["diary"])
    app.include_router(patterns.router, prefix="/v1", tags=["patterns"])
    app.include_router(signals.router, prefix="/v1", tags=["dogly-signals"])
    app.include_router(digestive.router, prefix="/v1", tags=["digestive"])
    app.include_router(
        owner_stories.router, prefix="/v1", tags=["owner-stories"]
    )
    app.include_router(nutrition.router, prefix="/v1", tags=["nutrition"])
    app.include_router(realtime.router, prefix="/v1", tags=["realtime"])
    app.include_router(subscription.router, prefix="/v1", tags=["subscription", "usage"])
    app.include_router(devices.router, prefix="/v1", tags=["devices"])
    app.include_router(privacy.router, prefix="/v1", tags=["privacy"])
    app.include_router(webhooks.router, prefix="/v1", tags=["webhooks"])
    return app


app = create_app()
