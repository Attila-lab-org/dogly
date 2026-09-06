"""Fixture-backed mock providers (default for local/dev/CI — sez. 0.2: paid AI
calls are mocked in CI). Output is always validated against the Pydantic
contracts; invalid fixtures fail loudly like a real schema failure."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

logger = logging.getLogger(__name__)

from app.config import Settings
from app.contracts.digestive import StoolObservationContract
from app.contracts.interpretation import InterpretationContract, SafetyFlag
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import AnalysisDomain, ContextBucket
from app.knowledge.models import DogContextSnapshot, KnowledgeContext
from app.providers.base import (
    EligiblePatternSummary,
    ProviderUsage,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as fh:
        return json.load(fh)


class MockVideoObserver:
    """Default VideoObserver: returns a validated ObservationContract V0 from a
    fixture. `video_ref` values containing 'nodog' simulate a quality rejection
    path (QUALITY_NO_DOG) for deterministic tests."""

    def __init__(self, settings: Settings) -> None:
        self._provider = settings.observer_provider
        self._model = settings.observer_model

    async def observe(
        self,
        *,
        video_ref: str,
        content_type: str,
        policy_version: str,
        duration_ms: int,
    ) -> tuple[ObservationContract, ProviderUsage]:
        del content_type
        started = time.perf_counter()
        raw = load_fixture("observation.fixture.json")
        if "nodog" in video_ref:
            raw["capture_quality"]["dog_visible_fraction"] = 0.0
            raw["capture_quality"]["overall_quality"] = "insufficient"
            raw["capture_quality"]["warnings"] = ["dog_not_visible"]
        raw["observer_meta"]["provider"] = self._provider
        raw["observer_meta"]["model"] = self._model
        raw["observer_meta"]["request_id"] = f"mock-{uuid.uuid4().hex[:12]}"
        contract = ObservationContract.model_validate(raw)
        usage = ProviderUsage(
            provider=self._provider,
            model=self._model,
            input_tokens=1200,
            output_tokens=450,
            media_bytes=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            cost_usd=0.0,
            request_id=contract.observer_meta.request_id,
        )
        return contract, usage


class MockReasoner:
    """Default Reasoner: maps the fixture observation to a validated
    InterpretationContract V0. If the observation reports an invisible dog, it
    abstains (INSUFFICIENT) per sez. 16.1."""

    def __init__(self, settings: Settings) -> None:
        self._provider = settings.reasoning_provider
        self._model = settings.reasoning_model

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
    ) -> tuple[InterpretationContract, ProviderUsage]:
        del eligible_memory, knowledge_context, dog_context, deterministic_safety_flags
        started = time.perf_counter()
        raw = load_fixture("interpretation.fixture.json")
        raw["policy_version"] = policy_version
        raw["context_bucket"] = context_bucket.value
        if observation.capture_quality.dog_visible_fraction == 0.0:
            raw["primary_intent"] = "INSUFFICIENT"
            raw["confidence_band"] = "LOW"
            raw["consumer_summary"] = (
                "Non ci sono abbastanza segnali: il cane non è visibile in modo sufficiente nel video."
            )
            raw["alternatives"] = []
            raw["evidence"] = [
                {
                    "source": "observation",
                    "description": "Cane non visibile nella clip",
                    "ref": "capture_quality.dog_visible_fraction",
                }
            ]
        contract = InterpretationContract.model_validate(raw)
        usage = ProviderUsage(
            provider=self._provider,
            model=self._model,
            input_tokens=2200,
            output_tokens=380,
            latency_ms=int((time.perf_counter() - started) * 1000),
            cost_usd=0.0,
            request_id=f"mock-{uuid.uuid4().hex[:12]}",
        )
        return contract, usage


class MockDigestiveVision:
    """Default DigestiveVision: validated StoolObservationContract from fixture."""

    def __init__(self, settings: Settings) -> None:
        self._provider = settings.digestive_vision_provider
        self._model = settings.digestive_vision_model

    async def observe_stool(
        self, *, image_ref: str
    ) -> tuple[StoolObservationContract, ProviderUsage]:
        started = time.perf_counter()
        raw = load_fixture("stool_observation.fixture.json")
        raw["meta"]["provider"] = self._provider
        raw["meta"]["model"] = self._model
        raw["meta"]["request_id"] = f"mock-{uuid.uuid4().hex[:12]}"
        contract = StoolObservationContract.model_validate(raw)
        usage = ProviderUsage(
            provider=self._provider,
            model=self._model,
            input_tokens=900,
            output_tokens=220,
            latency_ms=int((time.perf_counter() - started) * 1000),
            cost_usd=0.0,
            request_id=contract.meta.request_id,
        )
        return contract, usage


class InMemoryCostMeter:
    """Mock CostMeter: records cost events in memory (persisted to
    internal.ai_cost_events in production — sez. 10.4)."""

    def __init__(self) -> None:
        self.records: list[dict] = []

    async def record(
        self, *, usage: ProviderUsage, operation: str, domain: AnalysisDomain, event_id: str, user_id: str
    ) -> None:
        self.records.append(
            {
                "usage": usage.model_dump(),
                "operation": operation,
                "domain": domain.value,
                "event_id": event_id,
                "user_id": user_id,
            }
        )


class MockStorageProvider:
    """Mock private storage: issues deterministic fake signed URLs and simulates
    object presence after upload. Never exposes public URLs (sez. 12.1)."""

    def __init__(self) -> None:
        self.objects: set[tuple[str, str]] = set()
        self.blobs: dict[tuple[str, str], bytes] = {}

    async def create_signed_upload_url(
        self, *, bucket: str, path: str, content_type: str, ttl_seconds: int
    ) -> tuple[str, object]:
        from datetime import UTC, datetime, timedelta

        token = uuid.uuid4().hex
        url = f"https://storage.mock.local/{bucket}/sign/{path}?token={token}"
        expires_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        # In mock mode the object is considered uploaded as soon as complete is
        # called; tests can pre-seed `objects` to simulate real uploads.
        return url, expires_at

    async def create_signed_read_url(self, *, bucket: str, path: str, ttl_seconds: int) -> str:
        return f"https://storage.mock.local/{bucket}/read/{path}?ttl={ttl_seconds}"

    async def object_exists(self, *, bucket: str, path: str, expected_bytes: int | None = None) -> bool:
        return True  # mock: object validation always succeeds

    async def delete_object(self, *, bucket: str, path: str) -> None:
        self.objects.discard((bucket, path))
        self.blobs.pop((bucket, path), None)

    async def upload_bytes(self, *, bucket: str, path: str, data: bytes, content_type: str) -> None:
        del content_type
        self.objects.add((bucket, path))
        self.blobs[(bucket, path)] = data


class InMemoryJobQueue:
    """Fake queue for local/dev (sez. 4: local uses a fake queue). Payloads are
    IDs only. When ``dispatcher`` is set (wiring in ``build_default_state``),
    ogni enqueue viene smaltito davvero in un task asyncio in-process: senza
    dispatcher la coda registra soltanto (comportamento storico di test)."""

    def __init__(self) -> None:
        self.tasks: list[dict] = []
        self.dispatcher: Callable[[str, dict[str, str]], Awaitable[None]] | None = None
        self._inflight: set[asyncio.Task] = set()

    async def enqueue(self, *, task_type: str, payload: dict[str, str]) -> str:
        task_id = f"task-{uuid.uuid4().hex[:12]}"
        self.tasks.append({"task_id": task_id, "task_type": task_type, "payload": payload})
        if self.dispatcher is not None:
            task = asyncio.get_running_loop().create_task(self._dispatch(task_type, payload))
            self._inflight.add(task)
            task.add_done_callback(self._inflight.discard)
        return task_id

    async def wait_drained(self, timeout: float = 300.0) -> None:
        """Attende che tutti i dispatch in-flight terminino (drain per sweep/CLI)."""
        await asyncio.wait_for(asyncio.gather(*self._inflight, return_exceptions=True), timeout=timeout)

    async def _dispatch(self, task_type: str, payload: dict[str, str]) -> None:
        assert self.dispatcher is not None
        try:
            await self.dispatcher(task_type, payload)
        except Exception:
            logger.exception("local dispatch failed for task_type=%s", task_type)
