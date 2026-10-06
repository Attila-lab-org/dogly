"""Public contracts for the conversational Personal Dog Model."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

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
RealtimeMediaKind = Literal["PHOTO", "VIDEO"]


class RealtimeSessionCreate(BaseModel):
    dog_id: str
    modality: Literal["TEXT"] = "TEXT"


class RealtimeSessionOut(BaseModel):
    id: str
    dog_id: str
    dog_name: str
    owner_display_name: str | None = None
    # The client uses this only to offer an explicit resume choice. The
    # previous conversation is never silently presented as a new question.
    previous_topic: str | None = None
    welcome_text: str
    status: Literal["ACTIVE", "ENDED", "EXPIRED"]
    modality: Literal["TEXT"]
    model: str
    started_at: datetime
    expires_at: datetime


class RealtimeTurnCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    event_id: str | None = Field(default=None, max_length=80)
    context_source: Literal["behavior", "digestive"] | None = None
    # A photo shared from the conversation remains attached to this turn so
    # the reasoner can see it in the same context as the owner's message.
    photo_id: str | None = Field(default=None, max_length=80)
    photo_context: str | None = Field(default=None, max_length=280)
    # Internal test/migration bridge only; the product never exposes live voice.
    assistant_text: str | None = Field(default=None, max_length=1400)


class RealtimeMemoryProposal(BaseModel):
    id: str
    category: Literal["ROUTINE", "PREFERENCE", "DIET", "HEALTH", "GENERAL"]
    statement: str


class RealtimeTurnOut(BaseModel):
    id: str
    session_id: str
    assistant_text: str
    question: str | None = None
    question_options: list[str] = Field(default_factory=list, max_length=3)
    suggested_prompts: list[str] = Field(default_factory=list, max_length=3)
    terminal_state: RealtimeTerminalState
    domains: list[RealtimeDomain] = Field(default_factory=list)
    safety_flags: list[str] = Field(default_factory=list)
    memory_proposal: RealtimeMemoryProposal | None = None
    behavior_handoff_href: str | None = None
    media_invite: RealtimeMediaKind | None = None
    media_prompt: str | None = None
    attachment: dict[str, str] | None = None
    created_at: datetime


class RealtimeDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistant_text: str = Field(min_length=1, max_length=1400)
    # Per-turn semantic intent, persisted in decision_json, never a dog fact.
    response_mode: Literal[
        "CONVERSATION", "AFFECTION", "CONCERN", "GRIEF", "ANALYSIS", "CLOSURE"
    ] = "CONVERSATION"
    question: str | None = Field(default=None, max_length=240)
    question_options: list[str] = Field(default_factory=list, max_length=3)
    # Optional continuation chips. These are different from question_options:
    # they keep the conversation moving without pretending DOGly needs another
    # fact before it can answer.
    suggested_prompts: list[str] = Field(default_factory=list, max_length=3)
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
    media_invite: RealtimeMediaKind | None = None
    media_prompt: str | None = Field(default=None, max_length=180)
    # Internal Canine Intelligence claims. Never copied into RealtimeTurnOut.
    claims: list[ReasoningClaim] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def bounded_conversation(self) -> RealtimeDecision:
        if self.question and self.question_information_gain == "NONE":
            raise ValueError("A question must be able to change the decision")
        if not self.question:
            self.question_information_gain = "NONE"
            self.question_options = []
        elif any(not option.strip() or len(option) > 80 for option in self.question_options):
            raise ValueError("Question options must be short and non-empty")
        if any(not prompt.strip() or len(prompt) > 90 for prompt in self.suggested_prompts):
            raise ValueError("Suggested prompts must be short and non-empty")
        if self.memory_candidate and not self.memory_category:
            raise ValueError("Memory candidate requires a category")
        if self.terminal_state == "SAFETY_INTERRUPT":
            self.behavior_handoff = False
            self.media_invite = None
            self.media_prompt = None
            self.question = None
            self.question_options = []
            self.question_information_gain = "NONE"
            self.suggested_prompts = []
            self.memory_candidate = None
            self.memory_category = None
        elif self.behavior_handoff:
            self.terminal_state = "BEHAVIOR_VIDEO_HANDOFF"
            self.media_invite = "VIDEO"
        if self.question or self.media_invite or self.memory_candidate:
            self.suggested_prompts = []
        return self


class RealtimeMemoryDecision(BaseModel):
    action: Literal["CONFIRM", "REJECT"]


class RealtimeMemoryDecisionOut(BaseModel):
    proposal_id: str
    status: Literal["CONFIRMED", "REJECTED"]


