"""Persist provider cost telemetry to internal.ai_cost_events."""

from __future__ import annotations

from sqlalchemy import text

from app.config import Settings
from app.contracts.taxonomy import AnalysisDomain
from app.domains.db import get_engine
from app.providers.base import ProviderUsage


class DbCostMeter:
    def __init__(self, settings: Settings) -> None:
        self._engine = get_engine(settings)

    async def record(
        self,
        *,
        usage: ProviderUsage,
        operation: str,
        domain: AnalysisDomain,
        event_id: str,
        user_id: str,
    ) -> None:
        if self._engine is None:
            return
        async with self._engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    insert into internal.ai_cost_events (
                      event_id, user_id, domain, operation, provider, model,
                      input_tokens, output_tokens, media_bytes, cost_usd, latency_ms, outcome
                    ) values (
                      :event_id, :user_id, :domain, :operation, :provider, :model,
                      :input_tokens, :output_tokens, :media_bytes, :cost_usd, :latency_ms, 'COMPLETED'
                    )
                    """
                ),
                {
                    "event_id": event_id,
                    "user_id": user_id,
                    "domain": domain.value,
                    "operation": operation,
                    "provider": usage.provider,
                    "model": usage.model,
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "media_bytes": usage.media_bytes,
                    "cost_usd": usage.cost_usd,
                    "latency_ms": usage.latency_ms,
                },
            )
