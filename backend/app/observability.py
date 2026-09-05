"""Observability helpers: Sentry bootstrap + structured correlation IDs."""

from __future__ import annotations

import logging
import uuid

from app.config import Settings

logger = logging.getLogger("dogly")


def init_sentry(settings: Settings) -> None:
    if not settings.sentry_dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
    except ImportError:  # pragma: no cover - optional dependency in CI
        logger.warning("sentry-sdk not installed; skipping Sentry init")
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        environment=settings.app_env,
        integrations=[FastApiIntegration()],
    )


def new_correlation_id() -> str:
    return uuid.uuid4().hex
