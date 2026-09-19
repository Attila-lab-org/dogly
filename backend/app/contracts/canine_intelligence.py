"""Shared contracts for DOGly's unified Canine Intelligence.

These types separate:
- general model reasoning
- scientific validation
- personal dog knowledge
- current evidence
- safety / governance

They are internal read models. Public mobile contracts stay unchanged.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.provenance import (
    PROVENANCE_OWNER_LABEL,
    PersonalFactProvenance,
    normalize_provenance,
)
from app.knowledge.models import DogContextSnapshot
from app.providers.base import EligiblePatternSummary

__all__ = [
    "PROVENANCE_OWNER_LABEL",
    "CanineDomain",
    "CanineEvidenceItem",
    "CanineIntelligenceDecision",
    "ClaimBasis",
    "ClaimStrength",
    "ClaimValidation",
    "ClaimValidationStatus",
    "EvidenceVerification",
    "PersonalDogContext",
    "PersonalFact",
    "PersonalFactProvenance",
    "ReasoningClaim",
    "normalize_provenance",
]

CanineDomain = Literal[
    "BEHAVIOR",
    "DIGESTIVE",
    "NUTRITION",
    "CARE",
    "PROFILE",
    "GENERAL",
]

EvidenceVerification = Literal[
    "VERIFIED",
    "OWNER_CONFIRMED",
    "UNVERIFIED",
    "INFERRED",
]

ClaimBasis = Literal[
    "GENERAL_MODEL",
    "SCIENTIFIC_EVIDENCE",
    "CURRENT_OBSERVATION",
    "OWNER_REPORTED",
    "PERSONAL_KNOWLEDGE",
]

ClaimValidationStatus = Literal[
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "NOT_COVERED",
    "CONTRADICTED",
    "FORBIDDEN",
]

ClaimStrength = Literal["HEDGED", "MODERATE", "STRONG"]


class CanineEvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    domain: CanineDomain
    source_type: str
    source_id: str
    occurred_at: datetime | None = None
    provenance: PersonalFactProvenance
    verification: EvidenceVerification = "UNVERIFIED"
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)


class PersonalFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    value: Any
    provenance: PersonalFactProvenance
    domain: CanineDomain = "PROFILE"
    last_confirmed_at: datetime | None = None
    source_id: str | None = None


class PersonalDogContext(BaseModel):
    """Cross-domain personal knowledge for one dog (read model)."""

    model_config = ConfigDict(extra="forbid")

    version: str = "personal-dog-context/v2"
    dog_id: str
    dog_name: str
    owner_display_name: str | None = None
    identity: dict[str, Any] = Field(default_factory=dict)
    dog_context: DogContextSnapshot
    personal_facts: list[PersonalFact] = Field(default_factory=list)
    eligible_patterns: list[EligiblePatternSummary] = Field(default_factory=list)
    evidence: list[CanineEvidenceItem] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)

    def evidence_ids(self) -> set[str]:
        ids = {item.evidence_id for item in self.evidence}
        ids.update(item.source_id for item in self.evidence)
        ids.update(f"pattern:{pattern.pattern_id}" for pattern in self.eligible_patterns)
        ids.update(
            fact.source_id for fact in self.personal_facts if fact.source_id
        )
        return ids

    def reasoner_payload(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "dog_id": self.dog_id,
            "dog_name": self.dog_name,
            "owner_display_name": self.owner_display_name,
            "identity": self.identity,
            "dog_context": self.dog_context.model_dump(mode="json"),
            "personal_facts": [
                {
                    **fact.model_dump(mode="json"),
                    "owner_label": PROVENANCE_OWNER_LABEL[fact.provenance],
                }
                for fact in self.personal_facts[:20]
            ],
            "eligible_patterns": [
                pattern.model_dump(mode="json") for pattern in self.eligible_patterns[:8]
            ],
            "evidence": [
                {
                    **item.model_dump(mode="json"),
                    "owner_label": PROVENANCE_OWNER_LABEL[item.provenance],
                }
                for item in self.evidence[:16]
            ],
            "missing": self.missing,
            "rules": [
                "Distinguish observed, owner-reported, imported, inferred, and established patterns.",
                "A single episode is not a habit.",
                "Temporal coincidence is not causation.",
                "General canine knowledge is not a fact about this dog.",
            ],
        }


class ReasoningClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str
    statement: str
    basis: ClaimBasis
    strength: ClaimStrength = "HEDGED"
    source_ids: list[str] = Field(default_factory=list, max_length=12)
    scientific_card_ids: list[str] = Field(default_factory=list, max_length=8)
    asserts_causation: bool = False
    asserts_diagnosis: bool = False


class ClaimValidation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str
    status: ClaimValidationStatus
    reasons: list[str] = Field(default_factory=list)
    matched_scientific_ids: list[str] = Field(default_factory=list)
    # Lexical overlap is an audit hint only. It never decides truth by itself.
    semantic_overlap_score: float | None = Field(default=None, ge=0.0, le=1.0)
    owner_facing_strength: ClaimStrength = "HEDGED"


class CanineIntelligenceDecision(BaseModel):
    """Internal audit envelope for a governed reasoning turn."""

    model_config = ConfigDict(extra="forbid")

    claims: list[ReasoningClaim] = Field(default_factory=list)
    validations: list[ClaimValidation] = Field(default_factory=list)
    blocked: bool = False
    downgraded: bool = False
    notes: list[str] = Field(default_factory=list)
