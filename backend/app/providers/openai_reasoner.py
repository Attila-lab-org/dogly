"""OpenAI structured reasoner adapter (sez. 14 / 16).

Consumes ObservationContract only — never raw video. Emits InterpretationContract.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.contracts.interpretation import InterpretationContract, SafetyFlag
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ContextBucket
from app.domains.db import get_engine
from app.knowledge.models import DogContextSnapshot, KnowledgeContext
from app.providers.base import EligiblePatternSummary, ProviderUsage
from app.providers.budget import check_daily_budget

_SYSTEM = """You are a cautious canine behavior reasoner for a consumer app.
Given structured observations only (no video), produce a probabilistic interpretation.
Scientific cards are authoritative product evidence. Personal patterns may
personalize but never override safety. Life stage and lifestyle are modifiers,
not deterministic causes, and owner-reported facts must remain owner-reported.
General pretrained knowledge is only a tentative LOW-confidence hypothesis for
uncovered observations and must not introduce consumer recommendations.
Support abstention when evidence is insufficient. Never invent unobserved facts,
write personal patterns, or create advice. Return InterpretationContract JSON only.
When one simple owner answer would materially distinguish plausible readings,
set needs_context=true and ask at most one concrete Italian question in
context_question (for example whether they were near the door). Otherwise set
needs_context=false and context_question=null. Do not ask for facts already present.
Deterministic safety_flags in the input are established constraints: carry them
into safety_flags and never downgrade or drop them (sez. 19.3).
"""


class ProviderDisabled(RuntimeError):
    pass


class OpenAIReasoner:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._api_key = settings.openai_api_key
        self._model = settings.reasoning_model
        self._client = httpx.AsyncClient(timeout=90.0)

    async def interpret(
        self,
        *,
        observation: ObservationContract,
        context_bucket: ContextBucket,
        policy_version: str,
        eligible_memory: list[EligiblePatternSummary],
        knowledge_context: KnowledgeContext,
        dog_context: DogContextSnapshot,
        deterministic_safety_flags: list[SafetyFlag] | None = None,
        operation: str = "reasoner.interpret",
    ) -> tuple[InterpretationContract, ProviderUsage]:
        if self._settings.ai_kill_switch or self._settings.reasoner_kill_switch:
            raise ProviderDisabled("Reasoner kill switch is active")
        await check_daily_budget(
            get_engine(self._settings),
            role="reasoner",
            budget_usd=self._settings.reasoner_budget_usd_per_day,
            operation=operation,
        )
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")

        started = time.perf_counter()
        request_id = f"oai-{uuid.uuid4().hex[:12]}"
        memory_payload = [m.model_dump() for m in eligible_memory]
        safety_payload = [f.model_dump() for f in (deterministic_safety_flags or [])]
        user_payload = {
            "policy_version": policy_version,
            "context_bucket": context_bucket.value if hasattr(context_bucket, "value") else str(context_bucket),
            "observation": observation.model_dump(mode="json"),
            "eligible_memory": memory_payload,
            "knowledge_context": knowledge_context.model_dump(mode="json"),
            "dog_context": dog_context.model_dump(mode="json"),
            "deterministic_safety_flags": safety_payload,
        }

        response = await self._client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": json.dumps(user_payload)},
                ],
            },
        )
        if response.status_code >= 500:
            raise TimeoutError(f"OpenAI upstream {response.status_code}")
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        raw = json.loads(content)
        raw["policy_version"] = policy_version
        raw["context_bucket"] = user_payload["context_bucket"]
        try:
            contract = InterpretationContract.model_validate(raw)
        except ValidationError:
            raw = await self._repair(raw, policy_version, user_payload["context_bucket"])
            contract = InterpretationContract.model_validate(raw)

        usage_raw = payload.get("usage") or {}
        usage = ProviderUsage(
            provider="openai",
            model=self._model,
            input_tokens=int(usage_raw.get("prompt_tokens") or 0),
            output_tokens=int(usage_raw.get("completion_tokens") or 0),
            media_bytes=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            cost_usd=_estimate_openai_cost(
                usage_raw,
                input_usd_per_million=self._settings.reasoner_input_usd_per_million,
                output_usd_per_million=self._settings.reasoner_output_usd_per_million,
                safety_margin=self._settings.ai_cost_safety_margin,
            ),
            request_id=request_id,
        )
        return contract, usage

    async def _repair(self, raw: dict[str, Any], policy_version: str, context_bucket: str) -> dict[str, Any]:
        response = await self._client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {
                        "role": "user",
                        "content": "Fix JSON to match InterpretationContract. JSON only.\n"
                        + json.dumps(raw),
                    },
                ],
            },
        )
        response.raise_for_status()
        fixed = json.loads(response.json()["choices"][0]["message"]["content"])
        fixed["policy_version"] = policy_version
        fixed["context_bucket"] = context_bucket
        return fixed


def _estimate_openai_cost(
    usage_raw: dict[str, Any],
    *,
    input_usd_per_million: float,
    output_usd_per_million: float,
    safety_margin: float,
) -> float:
    inn = int(usage_raw.get("prompt_tokens") or 0)
    out = int(usage_raw.get("completion_tokens") or 0)
    listed_cost = (
        inn * input_usd_per_million + out * output_usd_per_million
    ) / 1_000_000
    return round(listed_cost * safety_margin, 6)
