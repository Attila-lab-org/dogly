"""Shared general canine science for DOGly's unified Core.

Replaces the small hardcoded companion_science_brief with registry-backed
owner-facing lines. Used by Realtime and available to specialist reasoners.
"""

from __future__ import annotations

from app.knowledge.digestive_registry import get_digestive_knowledge
from app.knowledge.intelligence_v3 import get_intelligence_v3
from app.knowledge.registry import get_registry

# Curated card IDs that are safe and useful for general companion talk.
_BEHAVIOR_CARD_IDS = (
    "OBS_TAIL_003",
    "OBS_BODY_002",
    "OBS_BODY_004",
    "AUD_BARK_001",
    "AUD_GROWL_001",
    "AUD_WHINE_001",
    "PRIOR_BREED_001",
    "PERSONAL_001",
)

_FALLBACK_LINES = {
    "OBS_TAIL_003": (
        "Scodinzolare non vuol dire automaticamente che e' felice: "
        "conta corpo, contesto e quel cane."
    ),
    "OBS_BODY_002": (
        "Un corpo rigido e' un segnale da ascoltare, non una prova di aggressivita'."
    ),
    "OBS_BODY_004": (
        "L'inchino di gioco e' un invito, ma vale solo se il resto del momento e' gioco."
    ),
    "AUD_BARK_001": (
        "L'abbaio non e' una parola. Puo' essere allerta, richiesta, gioco o disagio."
    ),
    "AUD_GROWL_001": (
        "Il ringhio non e' sempre aggressione: puo' comparire anche nel gioco "
        "o per chiedere spazio."
    ),
    "AUD_WHINE_001": (
        "Il piagnucolio puo' essere richiesta, disagio o eccitazione: non e' una frase."
    ),
    "PRIOR_BREED_001": (
        "La razza e' un accenno debole. Il cane davanti a te conta piu' dello stereotipo."
    ),
    "PERSONAL_001": (
        "Un'abitudine del cane nasce solo se lo stesso modo si ripete, "
        "non da un episodio solo."
    ),
}


def companion_science_lines(*, limit: int = 14) -> list[str]:
    """Owner-facing general canine science drawn from validated registries."""
    cards = {card.id: card for card in get_registry().base_knowledge_cards}
    lines: list[str] = []
    for card_id in _BEHAVIOR_CARD_IDS:
        if len(lines) >= limit:
            break
        fallback = _FALLBACK_LINES.get(card_id)
        if fallback:
            lines.append(f"- {fallback}")
            continue
        card = cards.get(card_id)
        if card is not None:
            lines.append(f"- {card.not_conclude}")

    digestive = get_digestive_knowledge()
    for claim in digestive.claims:
        if len(lines) >= limit:
            break
        if claim.id in {"DIG_SCORE_SCALE_001"} or "diagnosis" in (
            claim.forbidden or ""
        ).lower():
            # Prefer forbidden/constraint framing over raw clinical statements.
            text = (claim.forbidden or claim.statement or "").strip()
            if text:
                lines.append(f"- {text}")
                if len(lines) >= limit:
                    break

    # A couple of population / nutrition constraints from V3.
    for claim in get_intelligence_v3().claims:
        if len(lines) >= limit:
            break
        if claim.domain in {"population", "nutrition", "behavior"}:
            lines.append(f"- {claim.forbidden or claim.statement}")

    # Always keep the hard digestive safety line within the limit.
    safety_line = (
        "- Vomito ripetuto, sangue, feci nere, cane abbattuto o pancia gonfia: "
        "si sente il veterinario, non si aspetta."
    )
    lines = [line for line in lines if "veterinario" not in line.lower()]
    if len(lines) >= limit:
        lines = lines[: limit - 1]
    lines.append(safety_line)
    return lines[:limit]


def companion_science_brief() -> list[str]:
    """Backward-compatible alias used by Realtime voice/orchestrator."""
    return companion_science_lines()
