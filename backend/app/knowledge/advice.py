"""Deterministic, closed-catalog Advice Engine V2."""

from __future__ import annotations

from app.contracts.interpretation import InterpretationContract, SafetyFlag
from app.knowledge.models import AdviceItem, DogContextSnapshot, KnowledgeContext
from app.knowledge.registry import get_registry

_PRIORITY = {
    "URGENT_SAFETY": 0,
    "VET_ESCALATION": 1,
    "LOW_RISK_MANAGEMENT": 2,
    "DEVELOPMENT": 3,
    "ROUTINE": 4,
    "ENRICHMENT": 5,
    "TRAINING": 6,
    "MONITOR": 7,
    "POLICY_GUARDRAIL": 99,
}


def _has_urgent_safety(flags: list[SafetyFlag]) -> bool:
    return any(
        flag.severity.lower() in {"urgent", "critical"}
        or flag.code.upper() in {"IMMEDIATE_DANGER", "COLLAPSE", "BREATHING_DIFFICULTY"}
        for flag in flags
    )


def _context_tags(context: DogContextSnapshot, flags: list[SafetyFlag]) -> set[str]:
    tags = {"no_urgent_safety_flag"}
    if _has_urgent_safety(flags):
        tags.discard("no_urgent_safety_flag")
        tags.add("urgent_safety_flag")
        tags.add("immediate_danger")
    if any("PAIN" in flag.code.upper() for flag in flags):
        tags.add("severe_pain_possible")
        tags.add("pain_red_flag")
    else:
        tags.add("no_pain_red_flag")
    if context.recent_changes:
        tags.add("recent_change_present")
    if context.today_vs_usual:
        tags.add("routine_disruption_known")
    if any("mobility" in fact.key.lower() for fact in context.health_context):
        tags.add("owner_reports_mobility_limit_without_vet_clearance")
    return tags


def build_advice(
    interpretation: InterpretationContract,
    dog_context: DogContextSnapshot,
    knowledge_context: KnowledgeContext,
) -> AdviceItem | None:
    flags = interpretation.safety_flags
    if _has_urgent_safety(flags):
        # Urgent copy remains owned by the existing deterministic safety layer.
        return None

    intent = interpretation.primary_intent
    if intent is None:
        return None
    tags = _context_tags(dog_context, flags)
    candidates = []
    for entry in get_registry().advice_catalog:
        if knowledge_context.coverage == "LOW" and entry.category != "MONITOR":
            continue
        if intent.value not in entry.applies_to_intents:
            continue
        if dog_context.life_stage.value not in entry.life_stage:
            continue
        if not set(entry.requires).issubset(tags):
            continue
        if set(entry.contraindications) & tags:
            continue
        candidates.append(entry)
    if not candidates:
        return None

    selected = min(candidates, key=lambda item: (_PRIORITY.get(item.category, 98), item.code))
    evidence = ", ".join(card.card_id for card in knowledge_context.cards[:2])
    rationale = (
        f"Scelto dal catalogo Dogly usando le evidenze {evidence}."
        if evidence
        else "Scelto come azione prudente a basso rischio con copertura scientifica limitata."
    )
    return AdviceItem(
        code=selected.code,
        category=selected.category,
        action=selected.action,
        rationale=rationale,
        follow_up=selected.follow_up,
        source_ids=selected.sources,
        risk=selected.risk,
    )
