"""Public contracts for the conversational Personal Dog Model."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.contracts.canine_intelligence import ReasoningClaim

RealtimeDomain = Literal["BEHAVIOR", "DIGESTIVE", "NUTRITION", "CARE", "GENERAL"]
RealtimeTerminalState = Literal[
    "ANSWERED",
    "ABSTAINED",
    "SAFETY_INTERRUPT",
    "BEHAVIOR_VIDEO_HANDOFF",
    "MEMORY_CONFIRMATION_REQUIRED",
]


class RealtimeSessionCreate(BaseModel):
    dog_id: str
    modality: Literal["VOICE", "TEXT"] = "VOICE"


class RealtimeSessionOut(BaseModel):
    id: str
    dog_id: str
    dog_name: str
    owner_display_name: str | None = None
    welcome_text: str
    status: Literal["ACTIVE", "ENDED", "EXPIRED"]
    modality: Literal["VOICE", "TEXT"]
    model: str
    started_at: datetime
    expires_at: datetime


class RealtimeTurnCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    assistant_text: str | None = Field(default=None, max_length=900)


class RealtimeMemoryProposal(BaseModel):
    id: str
    category: Literal["ROUTINE", "PREFERENCE", "DIET", "HEALTH", "GENERAL"]
    statement: str


class RealtimeTurnOut(BaseModel):
    id: str
    session_id: str
    assistant_text: str
    question: str | None = None
    terminal_state: RealtimeTerminalState
    domains: list[RealtimeDomain] = Field(default_factory=list)
    safety_flags: list[str] = Field(default_factory=list)
    memory_proposal: RealtimeMemoryProposal | None = None
    behavior_handoff_href: str | None = None
    created_at: datetime


class RealtimeDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistant_text: str = Field(min_length=1, max_length=900)
    question: str | None = Field(default=None, max_length=240)
    terminal_state: RealtimeTerminalState = "ANSWERED"
    domains: list[RealtimeDomain] = Field(default_factory=list, max_length=3)
    safety_flags: list[str] = Field(default_factory=list, max_length=4)
    used_source_ids: list[str] = Field(default_factory=list, max_length=12)
    memory_candidate: str | None = Field(default=None, max_length=280)
    memory_category: Literal[
        "ROUTINE", "PREFERENCE", "DIET", "HEALTH", "GENERAL"
    ] | None = None
    question_information_gain: Literal[
        "NONE", "CHANGES_MEANING", "CHANGES_ACTION", "CHANGES_SAFETY"
    ] = "NONE"
    behavior_handoff: bool = False
    # Internal Canine Intelligence claims. Never copied into RealtimeTurnOut.
    claims: list[ReasoningClaim] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def bounded_conversation(self) -> RealtimeDecision:
        if self.question and self.question_information_gain == "NONE":
            raise ValueError("A question must be able to change the decision")
        if not self.question:
            self.question_information_gain = "NONE"
        if self.memory_candidate and not self.memory_category:
            raise ValueError("Memory candidate requires a category")
        if self.behavior_handoff:
            self.terminal_state = "BEHAVIOR_VIDEO_HANDOFF"
        return self


class RealtimeMemoryDecision(BaseModel):
    action: Literal["CONFIRM", "REJECT"]


class RealtimeMemoryDecisionOut(BaseModel):
    proposal_id: str
    status: Literal["CONFIRMED", "REJECTED"]


class RealtimeClientSecretOut(BaseModel):
    value: str
    expires_at: int
    model: str
    session_config: dict[str, Any]
