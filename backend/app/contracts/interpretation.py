"""InterpretationContract V0 (Spec V1 sez. 16.3) with closed intent taxonomy
(sez. 16.2). Reasoner must support abstention and alternatives; confidence is
band-only (no numeric %, O-07); consumer wording is probabilistic (sez. 16.1).
"""

from __future__ import annotations

import re
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


class PersonalPatternCandidate(BaseModel):
    """Meaning-level recurrence candidate; not permanent memory by itself."""

    model_config = ConfigDict(extra="forbid")

    semantic_key: str = Field(min_length=3, max_length=100)
    title: str = Field(min_length=3, max_length=120)
    support_summary: str = Field(min_length=3, max_length=240)
    context_key: str | None = Field(default=None, max_length=80)


class SafetyFlag(BaseModel):
    """Structured flags consumed by the deterministic copy layer (sez. 16.3).
    Generated text may never downgrade a safety flag (sez. 19.3)."""

    model_config = ConfigDict(extra="forbid")

    code: str
    severity: str = "info"


class ContextOption(BaseModel):
    """One plain-language answer that really answers ``context_question``.

    The client sends only ``id``. The server resolves the exact label already
    shown to the owner, so arbitrary or hidden client text never enters the
    reasoner.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=32, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=60)


class OwnerContextAnswer(BaseModel):
    """A server-resolved answer selected by the owner."""

    model_config = ConfigDict(extra="forbid")

    question: str
    answer_id: str
    label: str


class InterpretationContract(BaseModel):
    """InterpretationContract V0 root (sez. 16.3)."""

    model_config = ConfigDict(extra="forbid")

    # Closed taxonomy code, or null if insufficient (sez. 16.3).
    primary_intent: IntentCode | None = None
    confidence_band: ConfidenceBand
    # Short, cautious, localizable consumer string ("sembra / probabilmente / possibile").
    consumer_summary: str
    # Clip-specific consumer copy. Safety copy can still override the headline.
    consumer_headline: str = Field(min_length=3, max_length=100)
    dog_voice: str = Field(min_length=3, max_length=110)
    # Plain-language acoustic observation. This explains what was heard and
    # how it contributes in context; it is never a literal bark translation.
    sound_note: str | None = Field(default=None, max_length=220)
    # 0-2 plausible alternatives with rationale.
    alternatives: list[AlternativeIntent] = Field(default_factory=list, max_length=2)
    # Sez. 6.1: 3-5 evidence bullets when a primary intent is present.
    # Abstention (primary_intent null / INSUFFICIENT) may have an empty list.
    evidence: list[EvidenceItem] = Field(default_factory=list, max_length=5)
    # Signals that reduce confidence.
    contradictions: list[str] = Field(default_factory=list)
    personal_memory_used: list[PersonalMemoryUsed] = Field(default_factory=list)
    personal_pattern_candidate: PersonalPatternCandidate | None = None
    needs_context: bool = False
    # At most one simple question if the result materially improves.
    context_question: str | None = None
    # 2-4 answers authored together with the question. Never inferred from
    # keywords on the client.
    context_options: list[ContextOption] = Field(default_factory=list, max_length=4)
    # Present only after an owner answer has refined the reading.
    context_effect: str | None = Field(default=None, max_length=240)
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

    @model_validator(mode="after")
    def _context_question_has_matching_answers(self) -> InterpretationContract:
        if self.needs_context:
            if not self.context_question:
                raise ValueError("needs_context requires one context_question")
            if not 2 <= len(self.context_options) <= 4:
                raise ValueError("needs_context requires 2-4 context_options")
            if len({option.id for option in self.context_options}) != len(
                self.context_options
            ):
                raise ValueError("context option ids must be unique")
        elif self.context_question is not None or self.context_options:
            raise ValueError(
                "context_question/options must be empty when needs_context is false"
            )
        return self

    @model_validator(mode="after")
    def _owner_copy_never_leaks_internal_language(self) -> InterpretationContract:
        owner_copy = [
            self.consumer_headline,
            self.dog_voice,
            self.consumer_summary,
            self.sound_note or "",
            self.context_question or "",
            self.context_effect or "",
            *self.contradictions,
            *[item.description for item in self.evidence],
            *[item.rationale for item in self.alternatives],
            *[
                option.label
                for option in self.context_options
            ],
        ]
        joined = " ".join(owner_copy).casefold()
        forbidden = {
            "safe_",
            "advice_",
            "confidence band",
            "confidenza ",
            "play bow",
            "arousal",
            "context bucket",
            "baseline",
            "schema",
            "tassonomia",
            "taxonomy",
            "retrieval",
            *[intent.value.casefold() for intent in IntentCode],
        }
        leaked = next((term for term in forbidden if term in joined), None)
        internal_name = re.search(r"\b(?:rag|llm|openai|gemini)\b", joined)
        if leaked or internal_name or re.search(r"\b\d{1,3}\s*%", joined):
            raise ValueError("owner-facing copy contains internal or false-precision language")
        return self
