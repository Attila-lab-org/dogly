"""Digestive knowledge retrieval for consumer-intelligence audit metadata.

The dedicated Digestive Knowledge Registry V1 is the source of truth.
References are selected by deterministic claim triggers. They are audit
metadata, not diagnosis text, and are not dumped onto the primary consumer UI.
"""

from __future__ import annotations

from typing import Any

from app.knowledge.digestive_registry import (
    DigestiveKnowledgeFacts,
    DigestiveKnowledgeReference,
    DigestiveKnowledgeRetrieval,
    facts_from_observation,
)
from app.knowledge.digestive_registry import (
    retrieve_digestive_knowledge as retrieve_registry,
)

__all__ = [
    "DigestiveKnowledgeFacts",
    "DigestiveKnowledgeReference",
    "DigestiveKnowledgeRetrieval",
    "retrieve_digestive_knowledge",
]


def retrieve_digestive_knowledge(
    observation: dict[str, Any],
    *,
    state: str,
    safety_state: str,
    has_food_context: bool = False,
    quantity_present: bool = False,
    food_started_days_ago: int | None = None,
    prior_score_count: int = 0,
    recent_episode_count_24h: int = 0,
    recent_watery_count_24h: int = 0,
    episode_count_7d: int = 0,
    episode_count_30d: int = 0,
    watery_count_7d: int = 0,
    vomiting_today: bool | None = None,
    reduced_activity_today: bool | None = None,
    appetite_reduced: bool | None = None,
    straining_or_urgency: bool | None = None,
    unusual_food_48h: bool | None = None,
    supplements_or_medication: bool | None = None,
    weight_present: bool = False,
    age_stage_puppy: bool = False,
    size_large: bool = False,
    soft_or_loose: bool = False,
    owner_context_used: bool = False,
) -> DigestiveKnowledgeRetrieval:
    facts = facts_from_observation(
        observation,
        state=state,
        safety_state=safety_state,
        has_food=has_food_context,
        quantity_present=quantity_present,
        food_started_days_ago=food_started_days_ago,
        prior_score_count=prior_score_count,
        recent_episode_count_24h=recent_episode_count_24h,
        recent_watery_count_24h=recent_watery_count_24h,
        episode_count_7d=episode_count_7d,
        episode_count_30d=episode_count_30d,
        watery_count_7d=watery_count_7d,
        vomiting_today=vomiting_today,
        reduced_activity_today=reduced_activity_today,
        appetite_reduced=appetite_reduced,
        straining_or_urgency=straining_or_urgency,
        unusual_food_48h=unusual_food_48h,
        supplements_or_medication=supplements_or_medication,
        weight_present=weight_present,
        age_stage_puppy=age_stage_puppy,
        size_large=size_large,
        soft_or_loose=soft_or_loose,
        owner_context_used=owner_context_used,
    )
    return retrieve_registry(facts)
