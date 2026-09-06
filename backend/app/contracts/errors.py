"""Stable error taxonomy (Spec V1 sez. 22.1 / 9.1).

Errors return a stable code, a human-safe message, a retryable boolean and a
correlation_id. Provider stack traces are never exposed.
"""

from __future__ import annotations

import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class ErrorCode(StrEnum):
    AUTH_REQUIRED = "AUTH_REQUIRED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    IDEMPOTENCY_KEY_REQUIRED = "IDEMPOTENCY_KEY_REQUIRED"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    QUOTA_EXHAUSTED = "QUOTA_EXHAUSTED"
    UPLOAD_URL_EXPIRED = "UPLOAD_URL_EXPIRED"
    VIDEO_TOO_SHORT = "VIDEO_TOO_SHORT"
    VIDEO_TOO_LONG = "VIDEO_TOO_LONG"
    QUALITY_NO_DOG = "QUALITY_NO_DOG"
    QUALITY_LOW = "QUALITY_LOW"
    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    PROVIDER_SCHEMA_INVALID = "PROVIDER_SCHEMA_INVALID"
    AI_BUDGET_EXCEEDED = "AI_BUDGET_EXCEEDED"
    PROCESSING_FAILED = "PROCESSING_FAILED"
    SUBSCRIPTION_SYNC = "SUBSCRIPTION_SYNC"
    SAFETY_REVIEW = "SAFETY_REVIEW"
    INVALID_STATE = "INVALID_STATE"
    WEBHOOK_SIGNATURE_INVALID = "WEBHOOK_SIGNATURE_INVALID"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# (http_status, default_retryable) per code, aligned with sez. 22.1.
_ERROR_REGISTRY: dict[ErrorCode, tuple[int, bool]] = {
    ErrorCode.AUTH_REQUIRED: (401, False),
    ErrorCode.FORBIDDEN: (403, False),
    ErrorCode.NOT_FOUND: (404, False),
    ErrorCode.VALIDATION_FAILED: (422, False),
    ErrorCode.IDEMPOTENCY_KEY_REQUIRED: (400, False),
    ErrorCode.IDEMPOTENCY_CONFLICT: (409, False),
    ErrorCode.QUOTA_EXHAUSTED: (402, False),
    ErrorCode.UPLOAD_URL_EXPIRED: (410, True),
    ErrorCode.VIDEO_TOO_SHORT: (422, False),
    ErrorCode.VIDEO_TOO_LONG: (422, False),
    ErrorCode.QUALITY_NO_DOG: (422, False),
    ErrorCode.QUALITY_LOW: (422, True),
    ErrorCode.PROVIDER_TIMEOUT: (502, True),
    ErrorCode.PROVIDER_SCHEMA_INVALID: (502, True),
    ErrorCode.AI_BUDGET_EXCEEDED: (429, False),
    ErrorCode.PROCESSING_FAILED: (500, True),
    ErrorCode.SUBSCRIPTION_SYNC: (409, True),
    ErrorCode.SAFETY_REVIEW: (422, False),
    ErrorCode.INVALID_STATE: (409, False),
    ErrorCode.WEBHOOK_SIGNATURE_INVALID: (401, False),
    ErrorCode.INTERNAL_ERROR: (500, False),
}


class ErrorBody(BaseModel):
    """Canonical API error payload (sez. 9.1)."""

    code: ErrorCode
    message: str
    retryable: bool
    correlation_id: str


class ApiError(Exception):
    """Domain/API error carrying a stable taxonomy code."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        retryable: bool | None = None,
        correlation_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        status, default_retryable = _ERROR_REGISTRY[code]
        self.http_status = status
        self.retryable = default_retryable if retryable is None else retryable
        self.correlation_id = correlation_id or uuid.uuid4().hex
        self.details = details or {}
        super().__init__(message)

    def to_body(self) -> ErrorBody:
        return ErrorBody(
            code=self.code,
            message=self.message,
            retryable=self.retryable,
            correlation_id=self.correlation_id,
        )


def http_status_for(code: ErrorCode) -> int:
    return _ERROR_REGISTRY[code][0]
