"""Application configuration (Spec V1 sez. 4 + SPEC_AMENDMENT_V1.1).

All AI provider/model routing, retention TTLs and media constraints are
config-driven: no model ID is ever hard-coded in domain logic.

V1.1: V1 hosts on Vercel; every setting maps 1:1 to a Vercel Environment
Variable read from the process env (no GCP Secret Manager, no GCP client
libraries in V1 code).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"

    # --- Supabase Auth / JWT (sez. 24.2) ---
    supabase_jwt_issuer: str = "https://example-project.supabase.co/auth/v1"
    supabase_jwks_url: str | None = None
    supabase_jwt_audience: str = "authenticated"
    # Legacy HS256 shared-secret mode (empty = disabled, JWKS only).
    supabase_jwt_secret: str = ""

    # --- Database ---
    # Empty DATABASE_URL => in-memory mock repositories (local/dev/test).
    database_url: str = ""

    # --- AI provider routing (sez. 14.2) ---
    observer_provider: str = "mock"
    observer_model: str = "mock-observer-v0"
    reasoning_provider: str = "mock"
    reasoning_model: str = "mock-reasoner-v0"
    digestive_vision_provider: str = "mock"
    digestive_vision_model: str = "mock-digestive-vision-v0"

    # --- Storage ---
    storage_provider: str = "mock"
    storage_signed_url_ttl_seconds: int = 600

    # --- Billing ---
    revenuecat_webhook_secret: str = ""

    # --- Async processing / private worker ingress (SPEC_AMENDMENT_V1.1) ---
    # V1: Vercel Workflows (durable, retryable, push-based) behind the
    # JobQueue adapter. Local dev / CI: fake in-memory queue (unchanged).
    # Cloud Tasks/Cloud Run are only a documented future scaling path.
    job_queue_backend: str = "fake"  # "fake" (local) | "vercel_workflows" (staging/prod)
    workflow_base_url: str = ""  # e.g. https://<deployment>.vercel.app
    # Internal worker auth: workflow/internal routes accept only calls with
    # this shared secret header; empty = open (local dev only).
    worker_internal_token: str = ""

    # --- Media constraints (sez. 13) ---
    max_video_duration_ms: int = 20_000
    min_video_duration_ms: int = 5_000

    # --- Retention (sez. 23.2) ---
    raw_media_ttl_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
