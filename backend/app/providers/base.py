"""Provider interface boundaries (Spec V1 sez. 14.1).

Observer and reasoner are both replaceable. Raw Gemini/OpenAI JSON never
becomes a mobile contract (sez. 3.1). Real paid providers plug in behind these
protocols; default implementations are fixture-backed mocks (sez. 0.2).
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel

from app.contracts.digestive import StoolObservationContract
from app.contracts.interpretation import InterpretationContract, SafetyFlag
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import AnalysisDomain, ContextBucket
from app.knowledge.models import DogContextSnapshot, KnowledgeContext


class ProviderUsage(BaseModel):
    """Per-call telemetry persisted with the event (sez. 25.1)."""

    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    media_bytes: int = 0
    latency_ms: int = 0
    cost_usd: float = 0.0
    request_id: str = ""


class EligiblePatternSummary(BaseModel):
    """Only eligible pattern summaries reach the reasoner (sez. 16.1/17.2)."""

    pattern_id: str
    state: str
    title: str
    support_summary: str


@runtime_checkable
class VideoObserver(Protocol):
    """VideoObserver.observe: temporary video ref + policy -> ObservationContract.
    Invariant: describes observables only; no final intent (sez. 14.1)."""

    async def observe(
        self,
        *,
        video_ref: str,
        content_type: str,
        policy_version: str,
        duration_ms: int,
    ) -> tuple[ObservationContract, ProviderUsage]: ...


@runtime_checkable
class Reasoner(Protocol):
    """Reasoner.interpret: observation + context + policy + eligible memory
    -> InterpretationContract. Must support abstention/alternatives.
    deterministic_safety_flags are pre-LLM established constraints: the reasoner
    must propagate them and never downgrade them (sez. 19.3)."""

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
    ) -> tuple[InterpretationContract, ProviderUsage]: ...


@runtime_checkable
class DigestiveVision(Protocol):
    """Digestive vision adapter: observation separate from safety/rule layer
    (sez. 2 / 19.1)."""

    async def observe_stool(
        self, *, image_ref: str
    ) -> tuple[StoolObservationContract, ProviderUsage]: ...


@runtime_checkable
class CostMeter(Protocol):
    """CostMeter.record: every paid call traceable to event/user cohort."""

    async def record(
        self, *, usage: ProviderUsage, operation: str, domain: AnalysisDomain, event_id: str, user_id: str
    ) -> None: ...


@runtime_checkable
class StorageProvider(Protocol):
    """Private storage: server-issued signed URLs, exact path, short expiry
    (sez. 12.1). The API never proxies large media."""

    async def create_signed_upload_url(
        self, *, bucket: str, path: str, content_type: str, ttl_seconds: int
    ) -> tuple[str, Any]: ...

    async def object_exists(self, *, bucket: str, path: str, expected_bytes: int | None = None) -> bool: ...

    async def delete_object(self, *, bucket: str, path: str) -> None: ...

    async def upload_bytes(self, *, bucket: str, path: str, data: bytes, content_type: str) -> None: ...


@runtime_checkable
class JobQueue(Protocol):
    """JobQueue adapter (sez. 8.3): push-based retryable jobs. Payload is IDs
    only; no raw media bytes, no secrets (sez. 22)."""

    async def enqueue(self, *, task_type: str, payload: dict[str, str]) -> str: ...
