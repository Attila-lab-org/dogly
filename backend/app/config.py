"""Application configuration (Spec V1 sez. 4 + SPEC_AMENDMENT_V1.1).

All AI provider/model routing, retention TTLs and media constraints are
config-driven: no model ID is ever hard-coded in domain logic.

V1.1: V1 hosts on Vercel; every setting maps 1:1 to a Vercel Environment
Variable read from the process env (no GCP Secret Manager, no GCP client
libraries in V1 code).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_NON_LOCAL = frozenset({"staging", "production"})
_FORBIDDEN_MOCK = frozenset({"mock", "fake", "fixture", "local"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_env: str = "local"

    # --- Supabase Auth / JWT (sez. 24.2) ---
    supabase_jwt_issuer: str = "https://example-project.supabase.co/auth/v1"
    supabase_jwks_url: str | None = None
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_secret: str = ""

    # --- Supabase project (Storage + service role for server paths) ---
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # --- Database ---
    database_url: str = Field(
        default="",
        validation_alias=AliasChoices("DATABASE_URL", "POSTGRES_URL"),
    )

    # --- AI provider routing (sez. 14.2) ---
    observer_provider: str = "mock"
    observer_model: str = "mock-observer-v0"
    reasoning_provider: str = "mock"
    reasoning_model: str = "mock-reasoner-v0"
    digestive_vision_provider: str = "mock"
    digestive_vision_model: str = "mock-digestive-vision-v0"
    # Optional focused-verifier override. None follows the production vision
    # model so the safety-sensitive second look uses the same capability tier.
    digestive_verifier_model: str | None = None
    owner_transcription_model: str = "gpt-4o-mini-transcribe"
    realtime_reasoning_model: str = "gpt-5.2"
    realtime_voice_model: str = "gpt-realtime-2.1"
    realtime_voice: str = "cedar"

    # Public list prices in USD per 1M tokens. Keep these environment-overridden
    # whenever selecting a different model: model candidates and their pricing
    # change independently from application releases. The optional verifier
    # rates fall back to the vision rates only when it uses the same pricing.
    observer_input_usd_per_million: float = 0.75
    observer_output_usd_per_million: float = 3.75
    reasoner_input_usd_per_million: float = 1.75
    reasoner_output_usd_per_million: float = 14.0
    digestive_input_usd_per_million: float = 1.75
    digestive_output_usd_per_million: float = 14.0
    digestive_verifier_input_usd_per_million: float | None = None
    digestive_verifier_output_usd_per_million: float | None = None
    owner_transcription_usd_per_minute: float = 0.003
    ai_cost_safety_margin: float = 1.15

    gemini_api_key: str = ""
    openai_api_key: str = ""

    # Kill switches / budget caps (ops, sez. 25 / RUNBOOK)
    ai_kill_switch: bool = False
    observer_kill_switch: bool = False
    reasoner_kill_switch: bool = False
    digestive_vision_kill_switch: bool = False
    owner_transcription_kill_switch: bool = False
    realtime_kill_switch: bool = False
    observer_budget_usd_per_day: float = 50.0
    reasoner_budget_usd_per_day: float = 50.0
    digestive_vision_budget_usd_per_day: float = 25.0
    owner_transcription_budget_usd_per_day: float = 5.0

    # --- Storage ---
    storage_provider: str = "mock"
    storage_signed_url_ttl_seconds: int = 600
    behavior_raw_bucket: str = "behavior-raw"

    # --- Billing ---
    revenuecat_webhook_secret: str = ""

    # --- Async processing / private worker ingress (SPEC_AMENDMENT_V1.1) ---
    job_queue_backend: str = "fake"  # "fake" | "vercel_workflows"
    workflow_base_url: str = ""
    worker_internal_token: str = ""
    cron_secret: str = ""

    # --- Observability ---
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1

    # --- Media constraints (sez. 13) ---
    max_video_duration_ms: int = 20_000
    min_video_duration_ms: int = 5_000

    # --- Retention (sez. 23.2) ---
    raw_media_ttl_hours: int = 24

    # --- Intelligence V3 (off in production until evals pass) ---
    breed_intelligence_v1: bool = False
    morphology_observer_context_v1: bool = False
    nutrition_intelligence_v1: bool = False
    digestive_longitudinal_v3: bool = False
    open_pet_food_facts_v1: bool = False
    realtime_enabled: bool = False
    open_pet_food_facts_user_agent: str = "DOGly/1.0 (+https://dogly.app)"

    # --- CORS (sez. 9.1) ---
    # Comma-separated list of allowed origins for the public API. The mobile
    # web deployment (apps/mobile-web on Vercel) and local dev ports are
    # allowed by default; staging/production add their Vercel deployment URLs
    # via the CORS_ORIGINS env var.
    cors_origins: str = (
        "http://localhost:8083,http://127.0.0.1:8083,"
        "http://localhost:8081,http://127.0.0.1:8081"
    )

    @model_validator(mode="after")
    def _fail_fast_non_local(self) -> Settings:
        env = (self.app_env or "").strip().lower()
        if env not in _NON_LOCAL:
            return self

        missing: list[str] = []
        if not self.database_url:
            missing.append("DATABASE_URL")
        if not self.supabase_jwks_url and not self.supabase_jwt_secret:
            missing.append("SUPABASE_JWKS_URL")
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_service_role_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if not self.worker_internal_token:
            missing.append("WORKER_INTERNAL_TOKEN")
        if self.job_queue_backend != "vercel_workflows":
            missing.append("JOB_QUEUE_BACKEND=vercel_workflows")
        if self.storage_provider == "mock":
            missing.append("STORAGE_PROVIDER!=mock")
        if self.observer_provider in _FORBIDDEN_MOCK:
            missing.append("OBSERVER_PROVIDER!=mock")
        if self.reasoning_provider in _FORBIDDEN_MOCK:
            missing.append("REASONING_PROVIDER!=mock")
        if self.digestive_vision_provider in _FORBIDDEN_MOCK:
            missing.append("DIGESTIVE_VISION_PROVIDER!=mock")
        if self.observer_provider == "gemini" and not self.gemini_api_key:
            missing.append("GEMINI_API_KEY")
        if (
            (
                self.reasoning_provider == "openai"
                or self.digestive_vision_provider == "openai"
                or not self.owner_transcription_kill_switch
            )
            and not self.openai_api_key
        ):
            missing.append("OPENAI_API_KEY")

        if missing:
            raise ValueError(
                f"APP_ENV={env} rejects incomplete/mock wiring. Missing or invalid: "
                + ", ".join(missing)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
