"""Validate bundled Intelligence V3 claims and the V2 advice registry."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.knowledge.breed_resolver import breed_catalog, resolve_breed
from app.knowledge.intelligence_v3 import document_checksum, get_intelligence_v3
from app.knowledge.registry import get_registry


def main() -> int:
    registry = get_registry()
    document = get_intelligence_v3()
    catalog = breed_catalog()
    mix = resolve_breed("Mix", is_mix=True)
    unknown = resolve_breed(None)
    named = resolve_breed("Labrador Retriever")
    print(f"advice_registry={registry.metadata['version']} cards={len(registry.base_knowledge_cards)}")
    print(f"intelligence_v3={document.version} claims={len(document.claims)} checksum={document_checksum()[:12]}")
    print(f"breed_catalog={len(catalog)} mix_prior={mix.prior_eligible} unknown_prior={unknown.prior_eligible} labrador={named.canonical_id}")
    if mix.prior_eligible or unknown.prior_eligible or named.canonical_id != "labrador_retriever":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
