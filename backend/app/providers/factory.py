"""Provider factory: select mock vs real adapters from Settings (sez. 4 / 14.2)."""

from __future__ import annotations

from app.config import Settings
from app.providers.base import (
    CostMeter,
    DigestiveVision,
    JobQueue,
    Reasoner,
    StorageProvider,
    VideoObserver,
)
from app.providers.mock import (
    InMemoryCostMeter,
    MockDigestiveVision,
    MockReasoner,
    MockStorageProvider,
    MockVideoObserver,
)
from app.providers.vercel_workflows import build_job_queue


def build_storage(settings: Settings) -> StorageProvider:
    provider = (settings.storage_provider or "mock").lower()
    if provider == "mock":
        return MockStorageProvider()
    if provider == "supabase":
        from app.providers.supabase_storage import SupabaseStorageProvider

        return SupabaseStorageProvider(settings)
    raise ValueError(f"Unsupported STORAGE_PROVIDER: {settings.storage_provider}")


def build_observer(settings: Settings) -> VideoObserver:
    provider = (settings.observer_provider or "mock").lower()
    if provider == "mock":
        return MockVideoObserver(settings)
    if provider == "gemini":
        from app.providers.gemini_observer import GeminiVideoObserver

        return GeminiVideoObserver(settings)
    raise ValueError(f"Unsupported OBSERVER_PROVIDER: {settings.observer_provider}")


def build_reasoner(settings: Settings) -> Reasoner:
    provider = (settings.reasoning_provider or "mock").lower()
    if provider == "mock":
        return MockReasoner(settings)
    if provider == "openai":
        from app.providers.openai_reasoner import OpenAIReasoner

        return OpenAIReasoner(settings)
    raise ValueError(f"Unsupported REASONING_PROVIDER: {settings.reasoning_provider}")


def build_digestive_vision(settings: Settings) -> DigestiveVision:
    provider = (settings.digestive_vision_provider or "mock").lower()
    if provider == "mock":
        return MockDigestiveVision(settings)
    if provider == "openai":
        from app.providers.openai_digestive_vision import OpenAIDigestiveVision

        return OpenAIDigestiveVision(settings)
    raise ValueError(
        f"Unsupported DIGESTIVE_VISION_PROVIDER: "
        f"{settings.digestive_vision_provider}"
    )


def build_cost_meter(settings: Settings) -> CostMeter:
    if settings.database_url:
        from app.providers.db_cost_meter import DbCostMeter

        return DbCostMeter(settings)
    return InMemoryCostMeter()


def build_queue(settings: Settings) -> JobQueue:
    return build_job_queue(settings)
