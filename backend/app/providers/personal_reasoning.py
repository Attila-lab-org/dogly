"""GPT owns semantic reasoning; this module owns transport and validation."""

import json
import time
from typing import Any

import httpx
from fastapi.encoders import jsonable_encoder

from app.contracts.errors import ApiError, ErrorCode
from app.domains.db import get_engine
from app.knowledge.product_instruction import PRODUCT_INSTRUCTION
from app.providers.base import ProviderUsage
from app.providers.budget import check_daily_budget
from app.providers.openai_reasoner import _estimate_openai_cost


async def request_personal_json(settings, *, task: str, payload: dict,
                                image_url: str | None = None,
                                operation: str = "reasoner.personal") -> tuple[dict, ProviderUsage]:
    if settings.ai_kill_switch or settings.reasoner_kill_switch or not settings.openai_api_key:
        raise ApiError(ErrorCode.PROCESSING_FAILED, "DOGly non riesce ad analizzare ora. Riprova.", retryable=True)
    await check_daily_budget(get_engine(settings), role="reasoner",
                            budget_usd=settings.reasoner_budget_usd_per_day, operation=operation)
    started = time.perf_counter()
    content: Any = json.dumps(jsonable_encoder({"task": task, **payload}), ensure_ascii=False)
    if image_url:
        content = [{"type": "text", "text": content},
                   {"type": "image_url", "image_url": {"url": image_url, "detail": "auto"}}]
    body = {"model": settings.realtime_reasoning_model,
            "messages": [{"role": "system", "content": PRODUCT_INSTRUCTION},
                         {"role": "user", "content": content}],
            "response_format": {"type": "json_object"}}
    model_name = settings.realtime_reasoning_model.lower()
    if model_name.startswith(("gpt-5", "gpt-6")):
        # gpt-6.* rejects temperature and requires an explicit effort.
        body["reasoning_effort"] = "medium" if image_url else "low"
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post("https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"}, json=body)
            response.raise_for_status()
            raw = response.json()
            answer = json.loads(raw["choices"][0]["message"]["content"])
            if not isinstance(answer, dict):
                raise TypeError("Expected JSON object")
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise ApiError(ErrorCode.PROCESSING_FAILED, "DOGly non riesce ad analizzare ora. Riprova.", retryable=True) from exc
    usage = raw.get("usage", {})
    return answer, ProviderUsage(provider="openai", model=settings.realtime_reasoning_model,
        input_tokens=usage.get("prompt_tokens", 0), output_tokens=usage.get("completion_tokens", 0),
        request_id=raw.get("id", ""), latency_ms=int((time.perf_counter()-started)*1000),
        cost_usd=_estimate_openai_cost(
            usage,
            input_usd_per_million=settings.realtime_input_usd_per_million,
            output_usd_per_million=settings.realtime_output_usd_per_million,
            safety_margin=settings.ai_cost_safety_margin,
        ))


async def recognize_attachment(settings, *, image_url: str, user_text: str) -> tuple[dict, ProviderUsage]:
    raw, usage = await request_personal_json(settings, task="Descrivi il soggetto realmente visibile senza diagnosi o consigli. Restituisci JSON con description (stringa), domains (lista tra BEHAVIOR, DIGESTIVE, NUTRITION, CARE, GENERAL). Serve solo a recuperare il contesto pertinente.",
        payload={"owner_message": user_text}, image_url=image_url,
        operation="realtime.attachment_recognition")
    if not isinstance(raw.get("description"), str) or not raw["description"].strip():
        raise ApiError(ErrorCode.PROCESSING_FAILED, "Non riesco a leggere la foto. Riprova.", retryable=True)
    allowed = {"BEHAVIOR", "DIGESTIVE", "NUTRITION", "CARE", "GENERAL"}
    raw["domains"] = [d for d in raw.get("domains", []) if d in allowed][:3] or ["GENERAL"]
    raw["description"] = raw["description"][:1200]
    return raw, usage
