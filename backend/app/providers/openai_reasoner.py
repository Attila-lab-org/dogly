"""OpenAI structured reasoner adapter (sez. 14 / 16).

Consumes ObservationContract only — never raw video. Emits InterpretationContract.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.contracts.interpretation import (
    InterpretationContract,
    OwnerContextAnswer,
    SafetyFlag,
)
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ContextBucket
from app.domains.db import get_engine
from app.knowledge.models import DogContextSnapshot
from app.knowledge.product_instruction import PRODUCT_INSTRUCTION
from app.providers.base import (
    EligiblePatternSummary,
    ProviderRateLimitError,
    ProviderUsage,
)
from app.providers.budget import check_daily_budget

logger = logging.getLogger(__name__)


_OBSERVATION_REF_INDEX = re.compile(r"\[(\d+)\]")


def _resolve_observation_ref(payload: Any, ref: str) -> Any:
    """Resolve dotted observation refs across objects and bounded arrays.

    The observer contract contains ordered arrays for actions, transitions and
    vocalization candidates. The reasoner may cite an item in those arrays;
    treating every list as an opaque value incorrectly rejects valid evidence.
    """
    normalized_ref = _OBSERVATION_REF_INDEX.sub(r".\1", ref).strip(".")
    if normalized_ref == "observation":
        return None
    if normalized_ref.startswith("observation."):
        normalized_ref = normalized_ref.removeprefix("observation.")
    if not normalized_ref:
        return None
    value = payload
    for part in normalized_ref.split(".") if normalized_ref else []:
        if isinstance(value, dict):
            if part not in value:
                return None
            value = value[part]
            continue
        if isinstance(value, list) and part.isdigit():
            index = int(part)
            if index < 0 or index >= len(value):
                return None
            value = value[index]
            continue
        return None
    return value


def grounding_errors(
    contract: InterpretationContract,
    observation: ObservationContract,
    *,
    eligible_pattern_ids: set[str] | None = None,
    eligible_pattern_states: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Hard boundary: reject invented observations or memory references."""
    errors: list[dict[str, Any]] = []
    observation_payload = observation.model_dump(mode="json")
    for index, item in enumerate(contract.evidence):
        if item.source.value != "observation":
            continue
        if not item.ref:
            errors.append(
                {"loc": ["evidence", index, "ref"], "msg": "observable evidence requires ref"}
            )
            continue
        value = _resolve_observation_ref(observation_payload, item.ref)
        if value in (None, "unknown", "not_visible", [], {}):
            errors.append(
                {
                    "loc": ["evidence", index, "ref"],
                    "msg": f"{item.ref} is not observed in grounded input",
                }
            )

    owner_text = " ".join(
        [
            contract.consumer_headline,
            contract.consumer_summary,
            contract.dog_voice,
            contract.sound_note or "",
            *[item.description for item in contract.evidence],
        ]
    ).casefold()
    if observation.tail.visible.value == "no" and "coda" in owner_text:
        errors.append({"loc": ["tail"], "msg": "tail is not visible"})
    if observation.ears.visible.value == "no" and "orecchi" in owner_text:
        errors.append({"loc": ["ears"], "msg": "ears are not visible"})
    if observation.vocalization.present.value == "no" and any(
        token in owner_text for token in ("abba", "ringhi", "guait", "vocalizz")
    ):
        errors.append({"loc": ["vocalization"], "msg": "no dog vocalization observed"})

    allowed_patterns = eligible_pattern_ids or set()
    for index, memory in enumerate(contract.personal_memory_used):
        if memory.pattern_id not in allowed_patterns:
            errors.append(
                {
                    "loc": ["personal_memory_used", index, "pattern_id"],
                    "msg": "pattern is not eligible personal memory",
                }
            )
        elif eligible_pattern_states is not None and (
            memory.state.upper() != eligible_pattern_states.get(memory.pattern_id, "").upper()
        ):
            errors.append(
                {
                    "loc": ["personal_memory_used", index, "state"],
                    "msg": "memory state must match the supplied eligible pattern; never promote it",
                }
            )
    return errors


def _omits_sampling_params(model: str) -> bool:
    """gpt-5 / o-series reject temperature != default with HTTP 400."""
    name = model.lower()
    return name.startswith(("gpt-5", "o1", "o3", "o4"))


def chat_completion_body(
    model: str,
    messages: list[dict[str, Any]],
    *,
    temperature: float | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }
    if model.lower().startswith("gpt-5.2"):
        body["reasoning_effort"] = "high"
    if temperature is not None and not _omits_sampling_params(model):
        body["temperature"] = temperature
    return body


# The shared core carries identity and epistemic boundaries. Keep the runtime
# Behavior addition focused on decisions and the consumer output contract.
_SYSTEM = PRODUCT_INSTRUCTION + """
Interpreta osservazioni, sequenze, audio e contesto personale. Formula liberamente
la lettura più utile, con spiegazione e suggerimenti. Le etichette sono soltanto
metadati per l'interfaccia dopo il ragionamento, non conclusioni prescritte.
Restituisci InterpretationContract JSON. Scrivi tu consumer_headline,
consumer_summary, dog_voice (parafrasi ipotetica, mai citazione letterale),
sound_note, recommended_next_step, what_to_watch e baseline_note. Non aggiungere
un suggerimento o una domanda quando non serve. evidence cita percorsi effettivi
dell'osservazione. La memoria citata deve provenire dagli identificatori forniti.
La risposta al chiarimento aggiorna la lettura precedente. Mantieni osservazioni,
ipotesi e fatti personali distinti. Segui output_schema per la validazione tecnica.
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
        dog_context: DogContextSnapshot,
        dog_name: str = "il cane",
        owner_context_answer: OwnerContextAnswer | None = None,
        deterministic_safety_flags: list[SafetyFlag] | None = None,
        operation: str = "reasoner.interpret",
        intelligence_context: dict | None = None,
        processing_owner_context: list[dict] | None = None,
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
            "dog_context": dog_context.model_dump(mode="json"),
            "dog_name": dog_name,
            "owner_context_answer": (
                owner_context_answer.model_dump(mode="json")
                if owner_context_answer is not None
                else None
            ),
            "deterministic_safety_flags": safety_payload,
            "intelligence_context": intelligence_context,
            "processing_owner_context": processing_owner_context or [],
            "output_schema": InterpretationContract.model_json_schema(),
        }

        try:
            response = await self._client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=chat_completion_body(
                    self._model,
                    [
                        {"role": "system", "content": _SYSTEM},
                        {"role": "user", "content": json.dumps(user_payload)},
                    ],
                    temperature=0.2,
                ),
            )
        except httpx.TransportError as exc:
            raise TimeoutError("OpenAI transport error") from exc
        if response.status_code == 408 or response.status_code >= 500:
            raise TimeoutError(f"OpenAI upstream {response.status_code}")
        if response.status_code == 429:
            raise ProviderRateLimitError("OpenAI rate limit")
        if response.status_code >= 400:
            logger.error(
                "OpenAI reasoner HTTP %s: %s",
                response.status_code,
                response.text[:2000],
            )
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        raw = json.loads(content)
        raw["policy_version"] = policy_version
        raw["context_bucket"] = user_payload["context_bucket"]
        usage_payloads = [payload]
        try:
            contract = InterpretationContract.model_validate(raw)
        except ValidationError as exc:
            raw, repair_payload = await self._repair(
                raw,
                policy_version,
                user_payload["context_bucket"],
                user_payload,
                exc.errors(include_url=False),
            )
            usage_payloads.append(repair_payload)
            contract = InterpretationContract.model_validate(raw)
        boundary_errors = grounding_errors(
            contract,
            observation,
            eligible_pattern_ids={item.pattern_id for item in eligible_memory},
            eligible_pattern_states={item.pattern_id: item.state for item in eligible_memory},
        )
        if boundary_errors:
            repaired, repair_payload = await self._repair(
                raw,
                policy_version,
                user_payload["context_bucket"],
                user_payload,
                boundary_errors,
            )
            usage_payloads.append(repair_payload)
            contract = InterpretationContract.model_validate(repaired)
            remaining = grounding_errors(
                contract,
                observation,
                eligible_pattern_ids={item.pattern_id for item in eligible_memory},
                eligible_pattern_states={item.pattern_id: item.state for item in eligible_memory},
            )
            if remaining:
                raise ValueError(f"Reasoner output is not grounded: {remaining[:3]}")

        usage_raw = merge_openai_usage(*usage_payloads)
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

    async def _repair(
        self,
        raw: dict[str, Any],
        policy_version: str,
        context_bucket: str,
        grounded_input: dict[str, Any],
        validation_errors: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        try:
            response = await self._client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=chat_completion_body(
                    self._model,
                    [
                        {"role": "system", "content": _SYSTEM},
                        {
                            "role": "user",
                            "content": json.dumps(
                                {
                                    "task": (
                                        "Correct invalid_output using only grounded_input. "
                                        "Follow output_schema exactly. JSON only."
                                    ),
                                    "grounded_input": grounded_input,
                                    "validation_errors": validation_errors,
                                    "invalid_output": raw,
                                }
                            ),
                        },
                    ],
                    temperature=0,
                ),
            )
        except httpx.TransportError as exc:
            raise TimeoutError("OpenAI repair transport error") from exc
        if response.status_code == 408 or response.status_code >= 500:
            raise TimeoutError(f"OpenAI repair upstream {response.status_code}")
        if response.status_code == 429:
            raise ProviderRateLimitError("OpenAI repair rate limit")
        if response.status_code >= 400:
            logger.error(
                "OpenAI reasoner repair HTTP %s: %s",
                response.status_code,
                response.text[:2000],
            )
        response.raise_for_status()
        repair_payload = response.json()
        fixed = json.loads(repair_payload["choices"][0]["message"]["content"])
        fixed["policy_version"] = policy_version
        fixed["context_bucket"] = context_bucket
        return fixed, repair_payload


def merge_openai_usage(*payloads: dict[str, Any] | None) -> dict[str, int]:
    """Sum prompt/completion tokens across the first call and any repairs."""
    total = {"prompt_tokens": 0, "completion_tokens": 0}
    for payload in payloads:
        usage = (payload or {}).get("usage") or payload or {}
        total["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
        total["completion_tokens"] += int(usage.get("completion_tokens") or 0)
    return total


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
