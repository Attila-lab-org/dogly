"""Cautious extraction of unverified dog-food label fields from one photo."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.contracts.api import FoodLabelExtraction
from app.domains.db import get_engine
from app.providers.base import ProviderUsage
from app.providers.budget import check_daily_budget

_SYSTEM = """You identify commercial dog food from one package photo.
Transcribe only text that is genuinely visible in the supplied image. Brand and
the complete product/line name are the first priority because they will be used
to search a catalog and show the owner possible matches. Keep size, life stage,
protein/flavour, breed/size range, veterinary line, and dry/wet wording inside
the product name when printed: they distinguish variants. Never infer any field
from packaging style, logos you cannot read, or prior product knowledge.
If ingredients, percentages, calories, or feeding directions are visible,
transcribe them too, in their original language and order. Percent fields are
numbers without the percent sign. Keep calories exactly as printed, including
unit and basis. Use null for every field that is absent, cropped, blurred, or
uncertain. For each field return confidence from 0 to 1 based only on
legibility. Warnings must be short Italian instructions about what to
photograph again. Return one JSON object only.
"""

_CONFIDENCE_KEYS = frozenset(
    {
        "label",
        "brand",
        "name",
        "ingredients",
        "protein",
        "fat",
        "fiber",
        "moisture",
        "calories",
        "feeding_directions",
    }
)


def _json_content(payload: dict[str, Any]) -> dict[str, Any]:
    content = payload["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        raise TypeError("OpenAI returned non-text food-label output")
    text = content.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```")
        text = text.removesuffix("```").strip()
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise TypeError("Food-label output must be one JSON object")
    return parsed


def _normalize(raw: dict[str, Any]) -> dict[str, Any]:
    for key in ("brand", "name", "ingredients_raw", "feeding_directions"):
        value = raw.get(key)
        if isinstance(value, str):
            raw[key] = value.strip() or None
    analysis = raw.get("guaranteed_analysis")
    if not isinstance(analysis, dict):
        raw["guaranteed_analysis"] = {}
    confidence = raw.get("extraction_confidence")
    if isinstance(confidence, dict):
        raw["extraction_confidence"] = {
            key: max(0.0, min(1.0, float(value)))
            for key, value in confidence.items()
            if key in _CONFIDENCE_KEYS and isinstance(value, int | float)
        }
    else:
        raw["extraction_confidence"] = {}
    raw["extraction_confidence"].setdefault("label", 0.0)
    return raw


async def extract_food_label(
    settings: Settings,
    *,
    image_ref: str,
) -> tuple[FoodLabelExtraction, ProviderUsage]:
    if settings.ai_kill_switch or settings.digestive_vision_kill_switch:
        raise RuntimeError("Food-label extraction is disabled")
    await check_daily_budget(
        get_engine(settings),
        role="digestive_vision",
        budget_usd=settings.digestive_vision_budget_usd_per_day,
        operation="nutrition.extract_food_label",
    )
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    if not image_ref.startswith(("http://", "https://")):
        raise RuntimeError("Food-label extraction requires an HTTPS image")

    request_id = f"oai-food-label-{uuid.uuid4().hex[:12]}"
    started = time.perf_counter()
    schema_hint = {
        "brand": "string or null",
        "name": "string or null",
        "ingredients_raw": "verbatim visible text or null",
        "guaranteed_analysis": {
            "crude_protein_min": "number or null",
            "crude_fat_min": "number or null",
            "crude_fiber_max": "number or null",
            "moisture_max": "number or null",
            "calories": "verbatim value with unit/basis or null",
        },
        "feeding_directions": "verbatim visible text or null",
        "extraction_confidence": {
            key: "number 0..1" for key in sorted(_CONFIDENCE_KEYS)
        },
        "warnings": ["short Italian instruction"],
    }
    body = {
        "model": settings.digestive_vision_model,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Identifica questa confezione. JSON only. Schema: "
                            f"{json.dumps(schema_hint, ensure_ascii=False)}"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": image_ref, "detail": "high"},
                    },
                ],
            },
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
    except httpx.TransportError as exc:
        raise TimeoutError("Food-label reading is temporarily unavailable") from exc
    if response.status_code in (408, 429) or response.status_code >= 500:
        raise TimeoutError(f"OpenAI upstream {response.status_code}")
    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI rejected food-label request ({response.status_code})")
    payload = response.json()
    try:
        extraction = FoodLabelExtraction.model_validate(
            _normalize(_json_content(payload))
        )
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise ValueError("Provider returned an invalid food-label result") from exc

    usage_raw = payload.get("usage") or {}
    input_tokens = int(usage_raw.get("prompt_tokens") or 0)
    output_tokens = int(usage_raw.get("completion_tokens") or 0)
    listed_cost = (
        input_tokens * settings.digestive_input_usd_per_million
        + output_tokens * settings.digestive_output_usd_per_million
    ) / 1_000_000
    usage = ProviderUsage(
        provider="openai",
        model=settings.digestive_vision_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=int((time.perf_counter() - started) * 1000),
        cost_usd=round(listed_cost * settings.ai_cost_safety_margin, 6),
        request_id=request_id,
    )
    return extraction, usage
