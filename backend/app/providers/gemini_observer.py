"""Gemini native-video observer adapter (sez. 14 / 15).

Produces only ObservationContract (verifiable observables). Never emits intent.
Model ID comes exclusively from Settings.observer_model.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.contracts.observation import ObservationContract
from app.providers.base import ProviderUsage

_OBSERVER_SYSTEM = """You are a canine behavior video observer.
Describe ONLY observable facts visible/audible in the clip.
Do NOT infer intent, emotion labels as conclusions, or advice.
If something is not clearly visible, use unknown/not_visible values.
Return JSON matching the ObservationContract schema exactly.
"""


class ProviderDisabled(RuntimeError):
    pass


class GeminiVideoObserver:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._api_key = settings.gemini_api_key
        self._model = settings.observer_model
        self._client = httpx.AsyncClient(timeout=120.0)

    async def observe(
        self, *, video_ref: str, policy_version: str, duration_ms: int
    ) -> tuple[ObservationContract, ProviderUsage]:
        if self._settings.ai_kill_switch or self._settings.observer_kill_switch:
            raise ProviderDisabled("Observer kill switch is active")
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        started = time.perf_counter()
        request_id = f"gem-{uuid.uuid4().hex[:12]}"

        # video_ref is a storage path; caller/worker must resolve to a readable URI.
        # Staging/prod worker passes a short-lived signed HTTPS URL as video_ref.
        file_part: dict[str, Any]
        if video_ref.startswith(("http://", "https://")):
            file_part = {"file_data": {"file_uri": video_ref, "mime_type": "video/mp4"}}
        else:
            # Fallback: ask model with path metadata only is invalid for production;
            # require signed URL. Fail closed.
            raise RuntimeError("Gemini observer requires an HTTPS signed video_ref")

        schema_hint = {
            "schema_version": "observation.v0",
            "capture_quality": {
                "dog_visible_fraction": 0.0,
                "framing": "unknown",
                "lighting": "unknown",
                "motion_blur": "unknown",
                "audio_quality": "unknown",
                "overall_quality": "insufficient",
                "warnings": [],
            },
            "scene": {},
            "body": {},
            "head_face": {},
            "ears": {},
            "tail": {},
            "vocalization": {},
            "timeline": [],
            "unknowns": [],
            "observer_meta": {
                "provider": "gemini",
                "model": self._model,
                "request_id": request_id,
                "policy_version": policy_version,
            },
        }

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._model}:generateContent"
        )
        body = {
            "system_instruction": {"parts": [{"text": _OBSERVER_SYSTEM}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        file_part,
                        {
                            "text": (
                                f"Clip duration_ms={duration_ms}. policy_version={policy_version}. "
                                f"Return JSON only. Schema example keys: {json.dumps(list(schema_hint.keys()))}"
                            )
                        },
                    ],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
            },
        }

        response = await self._client.post(url, params={"key": self._api_key}, json=body)
        if response.status_code >= 500:
            raise TimeoutError(f"Gemini upstream {response.status_code}")
        response.raise_for_status()
        payload = response.json()
        text = _extract_text(payload)
        raw = json.loads(text)
        raw.setdefault("observer_meta", {})
        raw["observer_meta"]["provider"] = "gemini"
        raw["observer_meta"]["model"] = self._model
        raw["observer_meta"]["request_id"] = request_id
        raw["observer_meta"]["policy_version"] = policy_version

        try:
            contract = ObservationContract.model_validate(raw)
        except ValidationError:
            # One repair attempt: ask model to fix schema (sez. 22).
            repaired = await self._repair(raw, policy_version, request_id)
            contract = ObservationContract.model_validate(repaired)

        usage_meta = payload.get("usageMetadata") or {}
        usage = ProviderUsage(
            provider="gemini",
            model=self._model,
            input_tokens=int(usage_meta.get("promptTokenCount") or 0),
            output_tokens=int(usage_meta.get("candidatesTokenCount") or 0),
            media_bytes=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            cost_usd=_estimate_gemini_cost(usage_meta),
            request_id=request_id,
        )
        return contract, usage

    async def _repair(self, raw: dict, policy_version: str, request_id: str) -> dict:
        await asyncio.sleep(0)  # checkpoint for durable workflows
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._model}:generateContent"
        )
        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "Fix this JSON so it validates ObservationContract. "
                                "Return JSON only.\n" + json.dumps(raw)
                            )
                        }
                    ],
                }
            ],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0},
        }
        response = await self._client.post(url, params={"key": self._api_key}, json=body)
        response.raise_for_status()
        fixed = json.loads(_extract_text(response.json()))
        fixed.setdefault("observer_meta", {})
        fixed["observer_meta"].update(
            {"provider": "gemini", "model": self._model, "request_id": request_id, "policy_version": policy_version}
        )
        return fixed


def _extract_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")
    parts = (((candidates[0] or {}).get("content") or {}).get("parts")) or []
    texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
    text = "\n".join(t for t in texts if t).strip()
    if not text:
        raise RuntimeError("Gemini returned empty text")
    return text


def _estimate_gemini_cost(usage_meta: dict[str, Any]) -> float:
    # Rough placeholder rates; real billing uses provider invoices + cost meter.
    inn = int(usage_meta.get("promptTokenCount") or 0)
    out = int(usage_meta.get("candidatesTokenCount") or 0)
    return round((inn * 0.00000025) + (out * 0.000001), 6)
