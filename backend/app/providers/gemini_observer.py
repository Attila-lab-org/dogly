"""Gemini native-video observer adapter (sez. 14 / 15).

Produces only ObservationContract (verifiable observables). Never emits intent.
Model ID comes exclusively from Settings.observer_model.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
import uuid
from enum import StrEnum
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.contracts.observation import (
    ApproachWithdrawalFreeze,
    BodyHeight,
    EarPosition,
    Locomotion,
    ObservationContract,
    Posture,
    TailHeight,
    TailMovement,
    VocalizationType,
    normalize_observation_dict,
)
from app.domains.db import get_engine
from app.providers.base import ProviderRateLimitError, ProviderUsage
from app.providers.budget import check_daily_budget

_INLINE_VIDEO_MAX_BYTES = 18_000_000
_OBSERVER_SYSTEM = """You are a canine behavior video observer.
Describe ONLY observable facts visible/audible in the clip.
Do NOT infer intent, emotion labels as conclusions, or advice.
If something is not clearly visible, use unknown/not_visible values.
Return JSON matching the ObservationContract schema exactly.
Do not add extra keys. Do not invent field names.
Quality fields (framing, lighting, motion_blur, audio_quality, overall_quality)
must be exactly: good, degraded, insufficient, unknown, or absent for audio_quality.
Tri-state fields must be exactly: yes, no, or unknown — never booleans.
Fields documented with a list of strings are CLOSED vocabularies:
use exactly one of the listed values, lowercase, never an alias or synonym.
"""

_GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
_GEMINI_UPLOAD_ROOT = "https://generativelanguage.googleapis.com/upload/v1beta"
_FILE_READY_ATTEMPTS = 30


def _enum_values(enum: type[StrEnum]) -> list[str]:
    return [member.value for member in enum]


class ProviderDisabled(RuntimeError):
    pass


def _raise_for_provider_status(response: httpx.Response) -> None:
    if response.status_code == 429:
        raise ProviderRateLimitError("Gemini quota or rate limit exceeded")
    response.raise_for_status()


class GeminiVideoObserver:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._api_key = settings.gemini_api_key
        self._model = settings.observer_model
        self._client = httpx.AsyncClient(timeout=120.0)

    async def observe(
        self,
        *,
        video_ref: str,
        content_type: str,
        policy_version: str,
        duration_ms: int,
    ) -> tuple[ObservationContract, ProviderUsage]:
        if self._settings.ai_kill_switch or self._settings.observer_kill_switch:
            raise ProviderDisabled("Observer kill switch is active")
        await check_daily_budget(
            get_engine(self._settings),
            role="observer",
            budget_usd=self._settings.observer_budget_usd_per_day,
            operation="observer.observe",
        )
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        started = time.perf_counter()
        request_id = f"gem-{uuid.uuid4().hex[:12]}"

        if not video_ref.startswith(("http://", "https://")):
            raise RuntimeError("Gemini observer requires an HTTPS signed video_ref")

        # Gemini file_data does not accept an arbitrary Supabase signed URL.
        # Import the clip into the Gemini Files API first, wait until ACTIVE,
        # and always delete the provider copy after inference. If Files API
        # rejects the container (common for browser webm), fall back to inline.
        file_name: str | None = None
        try:
            file_name, file_uri, media_bytes = await self._upload_video_file(
                video_ref=video_ref,
                content_type=content_type,
                request_id=request_id,
            )
            file_part: dict[str, Any] = {
                "file_data": {
                    "file_uri": file_uri,
                    "mime_type": content_type,
                }
            }
        except RuntimeError as exc:
            if "rejected" not in str(exc).lower():
                raise
            media_bytes, file_part = await self._inline_video_part(
                video_ref=video_ref,
                content_type=content_type,
            )

        schema_hint = {
            "schema_version": "observation.v0",
            "capture_quality": {
                "dog_visible_fraction": 0.0,
                "framing": ["good", "degraded", "insufficient", "unknown"],
                "lighting": ["good", "degraded", "insufficient", "unknown"],
                "motion_blur": ["good", "degraded", "insufficient", "unknown"],
                "audio_quality": ["good", "degraded", "insufficient", "unknown", "absent"],
                "overall_quality": ["good", "degraded", "insufficient"],
                "warnings": [],
            },
            "scene": {},
            "body": {
                "body_height": _enum_values(BodyHeight),
                "posture": _enum_values(Posture),
                "rigidity_candidate": ["yes", "no", "unknown"],
                "locomotion": _enum_values(Locomotion),
                "approach_withdrawal_freeze": _enum_values(ApproachWithdrawalFreeze),
            },
            "head_face": {},
            "ears": {
                "position": _enum_values(EarPosition),
            },
            "tail": {
                "neutral_relative_height": _enum_values(TailHeight),
                "movement": _enum_values(TailMovement),
            },
            "vocalization": {
                "type_candidates": _enum_values(VocalizationType),
            },
            "timeline": [],
            "unknowns": [],
            "observer_meta": {
                "provider": "gemini",
                "model": self._model,
                "request_id": request_id,
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
                                "Return JSON only. Schema with the CLOSED allowed values "
                                "for each observable field:\n"
                                f"{json.dumps(schema_hint)}"
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

        try:
            response = await self._client.post(
                url,
                headers={"x-goog-api-key": self._api_key},
                json=body,
            )
            if response.status_code >= 500:
                raise TimeoutError(f"Gemini upstream {response.status_code}")
            _raise_for_provider_status(response)
            payload = response.json()
            text = _extract_text(payload)
            # Normalizzazione difensiva PRIMA della validazione: alias/sinonimi ->
            # valore canonico, garbage -> "unknown".
            raw = normalize_observation_dict(json.loads(text))
            raw.setdefault("observer_meta", {})
            raw["observer_meta"]["provider"] = "gemini"
            raw["observer_meta"]["model"] = self._model
            raw["observer_meta"]["request_id"] = request_id

            try:
                contract = ObservationContract.model_validate(raw)
            except ValidationError:
                # One repair attempt: ask model to fix schema (sez. 22).
                repaired = await self._repair(raw, request_id)
                contract = ObservationContract.model_validate(
                    normalize_observation_dict(repaired)
                )
        finally:
            if file_name:
                await self._delete_video_file(file_name)

        usage_meta = payload.get("usageMetadata") or {}
        usage = ProviderUsage(
            provider="gemini",
            model=self._model,
            input_tokens=int(usage_meta.get("promptTokenCount") or 0),
            output_tokens=(
                int(usage_meta.get("candidatesTokenCount") or 0)
                + int(usage_meta.get("thoughtsTokenCount") or 0)
            ),
            media_bytes=media_bytes,
            latency_ms=int((time.perf_counter() - started) * 1000),
            cost_usd=_estimate_gemini_cost(
                usage_meta,
                input_usd_per_million=self._settings.observer_input_usd_per_million,
                output_usd_per_million=self._settings.observer_output_usd_per_million,
                safety_margin=self._settings.ai_cost_safety_margin,
            ),
            request_id=request_id,
        )
        return contract, usage

    async def _upload_video_file(
        self,
        *,
        video_ref: str,
        content_type: str,
        request_id: str,
    ) -> tuple[str, str, int]:
        downloaded = await self._client.get(video_ref)
        downloaded.raise_for_status()
        media = downloaded.content
        if not media:
            raise RuntimeError("Downloaded behavior video is empty")

        start = await self._client.post(
            f"{_GEMINI_UPLOAD_ROOT}/files",
            headers={
                "x-goog-api-key": self._api_key,
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": str(len(media)),
                "X-Goog-Upload-Header-Content-Type": content_type,
                "Content-Type": "application/json",
            },
            json={"file": {"display_name": request_id}},
        )
        _raise_for_provider_status(start)
        upload_url = start.headers.get("x-goog-upload-url")
        if not upload_url:
            raise RuntimeError("Gemini Files API did not return an upload URL")

        uploaded = await self._client.post(
            upload_url,
            headers={
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize",
                "Content-Length": str(len(media)),
                "Content-Type": content_type,
            },
            content=media,
        )
        _raise_for_provider_status(uploaded)
        file_data = uploaded.json().get("file") or {}
        name = str(file_data.get("name") or "")
        if not name:
            raise RuntimeError("Gemini Files API returned no file name")

        ready = False
        try:
            for _ in range(_FILE_READY_ATTEMPTS):
                state = str(file_data.get("state") or "")
                if state == "ACTIVE":
                    uri = str(file_data.get("uri") or "")
                    if not uri:
                        raise RuntimeError("Gemini active file has no URI")
                    ready = True
                    return name, uri, len(media)
                if state == "FAILED":
                    error = file_data.get("error") or file_data.get("errorMessage") or {}
                    raise RuntimeError(
                        f"Gemini rejected the uploaded behavior video: {error}"
                    )
                await asyncio.sleep(1)
                status = await self._client.get(
                    f"{_GEMINI_API_ROOT}/{name}",
                    headers={"x-goog-api-key": self._api_key},
                )
                _raise_for_provider_status(status)
                file_data = status.json()

            raise TimeoutError("Gemini video processing did not become ACTIVE")
        finally:
            if not ready:
                # A provider copy must not survive a failed/aborted readiness poll.
                await asyncio.shield(self._delete_video_file(name))

    async def _inline_video_part(
        self,
        *,
        video_ref: str,
        content_type: str,
    ) -> tuple[int, dict[str, Any]]:
        downloaded = await self._client.get(video_ref)
        downloaded.raise_for_status()
        media = downloaded.content
        if not media:
            raise RuntimeError("Downloaded behavior video is empty")
        if len(media) > _INLINE_VIDEO_MAX_BYTES:
            raise RuntimeError("Gemini rejected the uploaded behavior video")
        return len(media), {
            "inline_data": {
                "mime_type": content_type,
                "data": base64.b64encode(media).decode("ascii"),
            }
        }

    async def _delete_video_file(self, name: str) -> None:
        try:
            await self._client.delete(
                f"{_GEMINI_API_ROOT}/{name}",
                headers={"x-goog-api-key": self._api_key},
            )
        except httpx.HTTPError:
            # Provider retention cleanup is best-effort and must never replace
            # the primary inference outcome.
            return

    async def _repair(self, raw: dict, request_id: str) -> dict:
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
        response = await self._client.post(
            url,
            headers={"x-goog-api-key": self._api_key},
            json=body,
        )
        _raise_for_provider_status(response)
        fixed = json.loads(_extract_text(response.json()))
        fixed.setdefault("observer_meta", {})
        fixed["observer_meta"].update(
            {"provider": "gemini", "model": self._model, "request_id": request_id}
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


def _estimate_gemini_cost(
    usage_meta: dict[str, Any],
    *,
    input_usd_per_million: float,
    output_usd_per_million: float,
    safety_margin: float,
) -> float:
    inn = int(usage_meta.get("promptTokenCount") or 0)
    out = int(usage_meta.get("candidatesTokenCount") or 0) + int(
        usage_meta.get("thoughtsTokenCount") or 0
    )
    listed_cost = (
        inn * input_usd_per_million + out * output_usd_per_million
    ) / 1_000_000
    return round(listed_cost * safety_margin, 6)
