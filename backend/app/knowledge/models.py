"""Typed runtime boundary for Dogly Knowledge + Advice V2."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.contracts.taxonomy import IntentCode


class AdviceOutcomeValue(StrEnum):
    HELPED = "HELPED"
    DID_NOT_HELP = "DID_NOT_HELP"
    UNKNOWN = "UNKNOWN"
    NOT_TRIED = "NOT_TRIED"


class SourceRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    type: str
    quality: str
    citation: str
    url: str
    use: str


class KnowledgeCard(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    domain: str
    label: str
    observable: str
    compatible: list[str]
    not_conclude: str
    modifiers: list[str]
    evidence: str
    consensus: str
    sources: list[str]


class AdviceCatalogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    category: str
    action: str
    applies_to_intents: list[str]
    life_stage: list[str]
    requires: list[str]
    contraindications: list[str]
    follow_up: str
    sources: list[str]
    risk: str


class KnowledgeRegistryDocument(BaseModel):
    model_config = ConfigDict(extra="allow")

    metadata: dict[str, Any]
    source_registry: list[SourceRecord]
    base_knowledge_cards: list[KnowledgeCard]
    life_stage_policy: dict[str, Any]
    dog_context_schema: dict[str, Any]
    advice_catalog: list[AdviceCatalogEntry]
    advice_policy: dict[str, Any]
    outcome_learning: dict[str, Any]

    @model_validator(mode="after")
    def validate_references_and_ids(self) -> KnowledgeRegistryDocument:
        source_ids = [source.id for source in self.source_registry]
        card_ids = [card.id for card in self.base_knowledge_cards]
        advice_codes = [item.code for item in self.advice_catalog]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("duplicate scientific source id")
        if len(card_ids) != len(set(card_ids)):
            raise ValueError("duplicate knowledge card id")
        if len(advice_codes) != len(set(advice_codes)):
            raise ValueError("duplicate advice code")
        known_sources = set(source_ids)
        for item in [*self.base_knowledge_cards, *self.advice_catalog]:
            unknown = set(item.sources) - known_sources
            if unknown:
                raise ValueError(f"{item.id if isinstance(item, KnowledgeCard) else item.code}: unknown sources {unknown}")
        valid_intents = {intent.value for intent in IntentCode}
        for advice in self.advice_catalog:
            unknown = set(advice.applies_to_intents) - valid_intents
            if unknown:
                raise ValueError(f"{advice.code}: unknown intents {unknown}")
        return self


class ScientificEvidenceSummary(BaseModel):
    card_id: str
    evidence_grade: str
    label: str
    compatible_interpretations: list[str]
    modifiers: list[str]
    forbidden_conclusion: str
    source_ids: list[str]


class KnowledgeContext(BaseModel):
    registry_version: str
    coverage: Literal["LOW", "MEDIUM", "HIGH"]
    cards: list[ScientificEvidenceSummary] = Field(default_factory=list, max_length=6)


class LifeStageContext(BaseModel):
    value: Literal["PUPPY", "YOUNG_ADULT", "MATURE_ADULT", "SENIOR", "UNKNOWN"]
    source: Literal["DERIVED", "PROFILE", "UNKNOWN"]
    confidence: Literal["LOW", "MEDIUM", "HIGH"]


class LifestyleFact(BaseModel):
    key: str
    value: Any
    provenance: str
    last_confirmed_at: datetime | None = None


class DogContextSnapshot(BaseModel):
    dog_id: str
    age_months: int | None = None
    life_stage: LifeStageContext
    size: str | None = None
    breed_label: str | None = None
    is_mix: bool = False
    routine: dict[str, LifestyleFact | None] = Field(default_factory=dict)
    today_vs_usual: list[LifestyleFact] = Field(default_factory=list)
    recent_changes: list[LifestyleFact] = Field(default_factory=list)
    preferences: list[LifestyleFact] = Field(default_factory=list)
    health_context: list[LifestyleFact] = Field(default_factory=list)


class AdviceItem(BaseModel):
    code: str
    category: str
    action: str
    rationale: str
    follow_up: str
    source_ids: list[str]
    risk: str
