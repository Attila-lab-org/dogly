"""Deterministic, closed-catalog Advice Engine V2."""

from __future__ import annotations

from app.contracts.interpretation import InterpretationContract, SafetyFlag
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import IntentCode
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
    "ADVICE_RESPOND_TO_PLAY": (
        "Se il momento è sicuro e ti va, accogli l’invito con un gioco breve e morbido. Fai piccole pause e lascia che sia libero di continuare o fermarsi.",
        "Durante una pausa, osserva se torna spontaneamente al gioco con un corpo sciolto oppure sceglie di fare altro.",
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
        (
            "Se ricapita, registra un altro breve momento e nota cosa stava "
            "succedendo poco prima."
        ),
        (
            "Confronta i prossimi momenti con il suo solito: ti aiuterà a capire "
            "se è una sua abitudine o qualcosa di nuovo."
        ),
    ),
    "ADVICE_NO_GENERIC_EXERCISE_DOSE": (
        "Non definire minuti di esercizio soltanto da età o razza: adatta l’attività a salute, temperamento, fase di vita, ambiente e abitudini.",
        "Se salute o mobilità possono limitare l’attività, confrontati con il veterinario.",
    ),
}

_RATIONALE_COPY: dict[str, str] = {
    "ADVICE_DISTANCE_CHOICE": (
        "Più distanza riduce la pressione e gli lascia una scelta: puoi così "
        "vedere se il corpo torna gradualmente più morbido."
    ),
    "ADVICE_REWARD_BASED_REDIRECT": (
        "Mostrargli con calma cosa può fare al posto di ciò che sta facendo è "
        "più chiaro e rispettoso che correggerlo fisicamente."
    ),
    "ADVICE_RESPOND_TO_PLAY": (
        "Le piccole pause rendono il gioco più leggibile: se riparte spontaneamente, "
        "l’invito al gioco diventa più plausibile."
    ),
    "ADVICE_SNIFF_EXPLORATION": (
        "Il fiuto può offrire un’attività coinvolgente senza aumentare ancora "
        "l’intensità del momento."
    ),
    "ADVICE_RESTORE_FAMILIAR_ROUTINE": (
        "Una situazione familiare aiuta a capire se il cambiamento dipendeva "
        "davvero da una giornata diversa dal solito."
    ),
    "ADVICE_PUPPY_SAFE_EXPOSURE": (
        "Procedere per piccoli passi permette al cucciolo di esplorare senza "
        "essere spinto oltre ciò che riesce a gestire."
    ),
    "ADVICE_SENIOR_CHANGE_VET": (
        "Un cambiamento nuovo in un cane anziano può avere molte cause: parlarne "
        "con il veterinario evita di attribuirlo automaticamente all’età."
    ),
    "ADVICE_MONITOR_BASELINE_CHANGE": (
        "Confrontare più episodi aiuta a distinguere un momento isolato da un "
        "cambiamento reale nelle sue abitudini."
    ),
}

_ALERT_ACTION = (
    "Controlla con calma ciò che sta segnalando. Se non c’è un pericolo, "
    "richiamalo lontano dallo stimolo e premialo appena torna a guardarti; "
    "evita di sgridarlo o di aumentare l’agitazione."
)
_ALERT_RATIONALE = (
    "Riconosci il suo avviso senza alimentarlo e gli mostri come tornare "
    "a una condizione più tranquilla."
)
_ALERT_FOLLOW_UP = (
    "Osserva se il corpo si rilassa e se riesce a staccare l’attenzione "
    "dallo stimolo."
)


def alert_vigilance_advice(source_ids: list[str] | None = None) -> AdviceItem:
    return AdviceItem(
        code="ADVICE_REWARD_BASED_REDIRECT",
        category="TRAINING",
        action=_ALERT_ACTION,
        rationale=_ALERT_RATIONALE,
        follow_up=_ALERT_FOLLOW_UP,
        source_ids=source_ids or ["S32"],
        risk="LOW",
    )


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
    *,
    observation: ObservationContract | None = None,
) -> AdviceItem | None:
    flags = interpretation.safety_flags
    if _has_urgent_safety(flags):
        # Urgent copy remains owned by the existing deterministic safety layer.
        return None

    # While a context question is the useful action, skip ordinary advice.
    if interpretation.needs_context:
        return None

    intent = interpretation.primary_intent
    if intent is None:
        return None
    tags = _context_tags(dog_context, flags)
    candidates = []
    for entry in get_registry().advice_catalog:
        if (
            knowledge_context.coverage == "LOW"
            or interpretation.contradictions
        ) and entry.category != "MONITOR":
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

    selected = None
    object_mouthing = False
    if intent == IntentCode.PLAY_INTERACTION:
        observed_text = ""
        if observation is not None:
            observed_text = " ".join(
                [
                    *observation.scene.visible_objects,
                    *observation.scene.spatial_relations,
                    *[
                        change
                        for segment in observation.timeline
                        for change in segment.observed_changes
                    ],
                ]
            ).lower()
        object_mouthing = any(
            marker in observed_text
            for marker in (
                "sock",
                "calza",
                "shoe",
                "scarpa",
                "clothing",
                "vestit",
                "mord",
                "bite",
                "mouth",
                "tirare",
                "pull",
            )
        )
        preferred = (
            "ADVICE_REWARD_BASED_REDIRECT"
            if object_mouthing
            else "ADVICE_RESPOND_TO_PLAY"
        )
        selected = next((item for item in candidates if item.code == preferred), None)
    selected = selected or min(
        candidates, key=lambda item: (_PRIORITY.get(item.category, 98), item.code)
    )
    action, follow_up = _ITALIAN_COPY.get(
        selected.code,
        (selected.action, selected.follow_up),
    )
    rationale = _RATIONALE_COPY.get(
        selected.code,
        "È un passo semplice e prudente mentre osservi come evolve la situazione.",
    )
    if (
        intent == IntentCode.PLAY_INTERACTION
        and selected.code == "ADVICE_REWARD_BASED_REDIRECT"
        and object_mouthing
    ):
        action = (
            "Invitalo a lasciare l’oggetto e offrigli un gioco che può "
            "mordicchiare. Quando lo sceglie, premialo con voce calma o con "
            "qualcosa che apprezza."
        )
        rationale = (
            "Così non spegni il suo invito: gli mostri con chiarezza con cosa "
            "può continuare a giocare."
        )
        follow_up = (
            "Osserva se passa volentieri al suo gioco e se il corpo resta "
            "sciolto durante lo scambio."
        )
    elif (
        intent == IntentCode.ALERT_VIGILANCE
        and selected.code == "ADVICE_REWARD_BASED_REDIRECT"
    ):
        return alert_vigilance_advice(selected.sources)

    # A stable recognized routine must not auto-ask to record another moment.
    if selected.code == "ADVICE_MONITOR_BASELINE_CHANGE":
        established = any(
            item.state.upper() in {"ESTABLISHED", "STRONG"}
            for item in interpretation.personal_memory_used
        )
        disrupted = any(
            str(fact.value).lower() in {"off", "unusual", "not_usual"}
            for fact in dog_context.today_vs_usual
        )
        if (
            established
            and not disrupted
            and intent
            not in {IntentCode.AMBIGUOUS, IntentCode.INSUFFICIENT}
        ):
            return None

    return AdviceItem(
        code=selected.code,
        category=selected.category,
        action=action,
        rationale=rationale,
        follow_up=follow_up,
        source_ids=selected.sources,
        risk=selected.risk,
    )
