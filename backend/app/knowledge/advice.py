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

_ITALIAN_COPY: dict[str, tuple[str, str]] = {
    "ADVICE_DISTANCE_CHOICE": (
        "Aumenta la distanza dallo stimolo e lascia al cane una possibilità reale di allontanarsi, senza forzare il contatto.",
        "Osserva se tensione, evitamento o vocalizzazioni diminuiscono quando aumenta la distanza.",
    ),
    "ADVICE_REWARD_BASED_REDIRECT": (
        "Proponi un comportamento alternativo e premialo; evita punizioni, intimidazioni o correzioni fisiche.",
        "Osserva se riesce a tornare calmo e se il comportamento diminuisce senza aumentare la tensione.",
    ),
    "ADVICE_SNIFF_EXPLORATION": (
        "Se salute e ambiente lo consentono, proponi un’attività calma di fiuto ed esplorazione invece di aumentare soltanto l’intensità.",
        "Confronta quanto facilmente si rilassa dopo l’attività rispetto al suo solito.",
    ),
    "ADVICE_RESTORE_FAMILIAR_ROUTINE": (
        "Se oggi la routine è davvero diversa, prova prima a ripristinare una situazione familiare e poco stressante.",
        "Confronta il comportamento quando la routine torna più vicina al normale.",
    ),
    "ADVICE_PUPPY_SAFE_EXPOSURE": (
        "Con un cucciolo usa un’esposizione graduale e positiva, mantenendo una distanza alla quale resta a suo agio; non forzare l’avvicinamento.",
        "Se la paura è intensa o persistente, chiedi supporto al veterinario o a un professionista del comportamento.",
    ),
    "ADVICE_SENIOR_CHANGE_VET": (
        "Un cambiamento nuovo o persistente in un cane anziano merita un confronto con il veterinario, senza attribuirlo automaticamente all’età.",
        "Contattalo prima se il cambiamento è improvviso, marcato o accompagnato da altri segnali fisici.",
    ),
    "ADVICE_MONITOR_BASELINE_CHANGE": (
        "Registra l’episodio e confronta frequenza, durata e contesto con il suo solito prima di trarre conclusioni forti.",
        "Usa le prossime osservazioni per capire se è una ricorrenza personale o un cambiamento nuovo.",
    ),
    "ADVICE_NO_GENERIC_EXERCISE_DOSE": (
        "Non definire minuti di esercizio soltanto da età o razza: adatta l’attività a salute, temperamento, fase di vita, ambiente e abitudini.",
        "Se salute o mobilità possono limitare l’attività, confrontati con il veterinario.",
    ),
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
    action, follow_up = _ITALIAN_COPY.get(
        selected.code,
        (selected.action, selected.follow_up),
    )
    rationale = (
        "Azione prudente del catalogo Dogly, compatibile con questa possibile "
        "lettura, il contesto disponibile e la fase di vita."
    )
    return AdviceItem(
        code=selected.code,
        category=selected.category,
        action=action,
        rationale=rationale,
        follow_up=follow_up,
        source_ids=selected.sources,
        risk=selected.risk,
    )
