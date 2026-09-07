"""OpenAI image observer for digestive captures.

Produces only the structured StoolObservationContract. Medical/safety routing
remains deterministic in the digestive domain and is never delegated to the
model.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.contracts.digestive import (
    CandidateLevel,
    FecalConsistency,
    StoolObservationContract,
)
from app.contracts.taxonomy import ConfidenceBand
from app.domains.db import get_engine
from app.providers.base import ProviderUsage
from app.providers.budget import check_daily_budget

_SYSTEM = """You are a cautious visual observer for a consumer dog-health app.
Inspect only visible properties of the stool image. Do not diagnose disease,
claim laboratory certainty, prescribe treatment, or infer facts not visible.
Use unknown when the image cannot support a field. A failure to see blood,
mucus, melena, or foreign material means none_observed, never proven absence.
If the image is blurred, too dark, obstructed, or does not clearly show stool,
set image_quality to insufficient and fecal_score_estimate to null.
Return one JSON object only, matching the supplied closed vocabulary.
"""


class ProviderDisabled(RuntimeError):
    pass


def _json_content(payload: dict[str, Any]) -> dict[str, Any]:
    content = payload["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        raise TypeError("OpenAI returned non-text digestive output")
    text = content.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```")
        text = text.removesuffix("```").strip()
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise TypeError("OpenAI digestive output must be a JSON object")
    return parsed


class OpenAIDigestiveVision:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._api_key = settings.openai_api_key
        self._model = settings.digestive_vision_model
        self._client = httpx.AsyncClient(timeout=90.0)

    async def observe_stool(
        self, *, image_ref: str
    ) -> tuple[StoolObservationContract, ProviderUsage]:
        if (
            self._settings.ai_kill_switch
            or self._settings.digestive_vision_kill_switch
        ):
            raise ProviderDisabled("Digestive vision kill switch is active")
        await check_daily_budget(
            get_engine(self._settings),
            role="digestive_vision",
            budget_usd=self._settings.digestive_vision_budget_usd_per_day,
            operation="digestive_vision.observe_stool",
        )
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        if not image_ref.startswith(("http://", "https://")):
            raise RuntimeError("OpenAI digestive vision requires an HTTPS image_ref")

        request_id = f"oai-digestive-{uuid.uuid4().hex[:12]}"
        started = time.perf_counter()
        schema_hint = {
            "schema_version": "stool_observation.v0",
            "image_quality": ["sufficient", "insufficient"],
            "warnings": ["short machine-readable strings"],
            "fecal_score_estimate": "integer 1-7 or null",
            "consistency": [value.value for value in FecalConsistency],
            "shape": "short visible descriptor or unknown",
            "apparent_moisture": ["low", "normal", "high", "unknown"],
            "segmentation": ["present", "reduced", "absent", "unknown"],
            "color": "short visible descriptor or unknown",
            "color_uncertainty": "low, medium, high, or unknown",
            "color_uniformity": ["uniform", "non_uniform", "unknown"],
            "mucus_candidate": [value.value for value in CandidateLevel],
            "fresh_blood_candidate": [value.value for value in CandidateLevel],
            "melena_candidate": [value.value for value in CandidateLevel],
            "foreign_material_candidate": [value.value for value in CandidateLevel],
            "undigested_food_candidate": [value.value for value in CandidateLevel],
            "apparent_volume": ["low", "normal", "high", "not_assessable"],
            "confidence_band": [value.value for value in ConfidenceBand],
        }
        response = await self._client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Observe this digestive capture. Return JSON only. "
                                    f"Closed schema: {json.dumps(schema_hint)}"
                                ),
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": image_ref, "detail": "high"},
                            },
                        ],
                    },
                ],
            },
        )
        if response.status_code == 429 or response.status_code >= 500:
            raise TimeoutError(f"OpenAI upstream {response.status_code}")
        response.raise_for_status()
        payload = response.json()
        raw = _json_content(payload)
        self._stamp_meta(raw, request_id)
        try:
            contract = StoolObservationContract.model_validate(raw)
        except ValidationError:
            contract = StoolObservationContract.model_validate(
                await self._repair(raw, request_id)
            )

        usage_raw = payload.get("usage") or {}
        usage = ProviderUsage(
            provider="openai",
            model=self._model,
            input_tokens=int(usage_raw.get("prompt_tokens") or 0),
            output_tokens=int(usage_raw.get("completion_tokens") or 0),
            media_bytes=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            cost_usd=_estimate_cost(usage_raw),
            request_id=request_id,
        )
        return contract, usage

    async def _repair(
        self, raw: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        response = await self._client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Repair the supplied JSON to match "
                            "StoolObservationContract. JSON only."
                        ),
                    },
                    {"role": "user", "content": json.dumps(raw)},
                ],
            },
        )
        if response.status_code == 429 or response.status_code >= 500:
            raise TimeoutError(f"OpenAI repair upstream {response.status_code}")
        response.raise_for_status()
        fixed = _json_content(response.json())
        self._stamp_meta(fixed, request_id)
        return fixed

    def _stamp_meta(self, raw: dict[str, Any], request_id: str) -> None:
        raw["schema_version"] = "stool_observation.v0"
        raw["meta"] = {
            "schema_version": "stool_observation.v0",
            "provider": "openai",
            "model": self._model,
            "request_id": request_id,
        }


def _estimate_cost(usage_raw: dict[str, Any]) -> float:
    input_tokens = int(usage_raw.get("prompt_tokens") or 0)
    output_tokens = int(usage_raw.get("completion_tokens") or 0)
    return round((input_tokens * 0.00000025) + (output_tokens * 0.000002), 6)
