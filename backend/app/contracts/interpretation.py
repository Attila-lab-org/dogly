"""InterpretationContract V0 (Spec V1 sez. 16.3) with closed intent taxonomy
(sez. 16.2). Reasoner must support abstention and alternatives; confidence is
band-only (no numeric %, O-07); consumer wording is probabilistic (sez. 16.1).
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.contracts.taxonomy import (
    INTENT_TAXONOMY_VERSION,
    INTERPRETATION_POLICY_VERSION,
    INTERPRETATION_SCHEMA_VERSION,
    ConfidenceBand,
    ContextBucket,
    IntentCode,
)


class EvidenceSource(StrEnum):
    OBSERVATION = "observation"
    CONTEXT = "context"
    PERSONAL_PATTERN = "personal_pattern"
    SCIENTIFIC_KB = "scientific_kb"
    LIFE_STAGE = "life_stage"
    LIFESTYLE_BASELINE = "lifestyle_baseline"


class EvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: EvidenceSource
    description: str
    # Pointer into the current observation (e.g. "tail.movement") when applicable.
    ref: str | None = None


class AlternativeIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: IntentCode
    rationale: str


class PersonalMemoryUsed(BaseModel):
    """Only ELIGIBLE pattern summaries, never full history (sez. 16.1)."""

    model_config = ConfigDict(extra="forbid")

    pattern_id: str
    state: str
    support_summary: str


class SafetyFlag(BaseModel):
    """Structured flags consumed by the deterministic copy layer (sez. 16.3).
    Generated text may never downgrade a safety flag (sez. 19.3)."""

    model_config = ConfigDict(extra="forbid")

    code: str
    severity: str = "info"


class InterpretationContract(BaseModel):
    """InterpretationContract V0 root (sez. 16.3)."""

    model_config = ConfigDict(extra="forbid")

    # Closed taxonomy code, or null if insufficient (sez. 16.3).
    primary_intent: IntentCode | None = None
    confidence_band: ConfidenceBand
    # Short, cautious, localizable consumer string ("sembra / probabilmente / possibile").
    consumer_summary: str
    # 0-2 plausible alternatives with rationale.
    alternatives: list[AlternativeIntent] = Field(default_factory=list, max_length=2)
    # Sez. 6.1: 3-5 evidence bullets when a primary intent is present.
    # Abstention (primary_intent null / INSUFFICIENT) may have an empty list.
    evidence: list[EvidenceItem] = Field(default_factory=list, max_length=5)
    # Signals that reduce confidence.
    contradictions: list[str] = Field(default_factory=list)
    personal_memory_used: list[PersonalMemoryUsed] = Field(default_factory=list)
    needs_context: bool = False
    # At most one simple question if the result materially improves.
    context_question: str | None = None
    safety_flags: list[SafetyFlag] = Field(default_factory=list)
    # Current capture context bucket (sez. 33.7).
    context_bucket: ContextBucket = ContextBucket.UNKNOWN
    # Mandatory versions for audit and replay (sez. 16.3).
    schema_version: str = INTERPRETATION_SCHEMA_VERSION
    policy_version: str = INTERPRETATION_POLICY_VERSION
    taxonomy_version: str = INTENT_TAXONOMY_VERSION

    @model_validator(mode="after")
    def _evidence_count_matches_intent(self) -> InterpretationContract:
        """Sez. 6.1: a result with a primary intent must carry 3-5 typed
        evidence bullets tied to the current event. INSUFFICIENT / abstention
        results (primary_intent null or INSUFFICIENT) may have an empty list.
        """
        if self.primary_intent in (None, IntentCode.INSUFFICIENT):
            return self
        if not 3 <= len(self.evidence) <= 5:
            raise ValueError(
                "evidence must contain 3-5 items when primary_intent is present "
                f"(sez. 6.1); got {len(self.evidence)} for {self.primary_intent.value}"
            )
        return self
