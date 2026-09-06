"""Fail-fast settings for staging/production (production foundation gate)."""

from __future__ import annotations

import pytest
from app.api.deps import build_default_state
from app.config import Settings
from pydantic import ValidationError


def test_local_allows_mocks() -> None:
    settings = Settings(app_env="local", observer_provider="mock", storage_provider="mock")
    state = build_default_state(settings)
    assert type(state.observer).__name__ == "MockVideoObserver"
    assert type(state.storage).__name__ == "MockStorageProvider"


def test_staging_rejects_incomplete_wiring() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="staging")


def test_staging_accepts_complete_non_mock_wiring() -> None:
    settings = Settings(
        app_env="staging",
        database_url="postgresql+asyncpg://user:pass@localhost/db",
        supabase_jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-role",
        worker_internal_token="internal-token",
        job_queue_backend="vercel_workflows",
        workflow_base_url="https://example.vercel.app",
        storage_provider="supabase",
        observer_provider="gemini",
        observer_model="gemini-2.0-flash",
        reasoning_provider="openai",
        reasoning_model="gpt-4.1-mini",
        digestive_vision_provider="openai",
        digestive_vision_model="gpt-5-mini",
        gemini_api_key="gem-key",
        openai_api_key="oai-key",
    )
    assert settings.app_env == "staging"
