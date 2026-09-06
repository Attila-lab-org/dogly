"""Load and validate the bundled scientific registry once per process."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.knowledge.models import KnowledgeRegistryDocument

DATA_PATH = Path(__file__).parent / "data" / "dogly_knowledge_advice_v2.json"
EXPECTED_VERSION = "2.0"


@lru_cache(maxsize=1)
def get_registry() -> KnowledgeRegistryDocument:
    with DATA_PATH.open(encoding="utf-8") as handle:
        registry = KnowledgeRegistryDocument.model_validate(json.load(handle))
    if registry.metadata.get("version") != EXPECTED_VERSION:
        raise ValueError(
            f"Unsupported Dogly knowledge version: {registry.metadata.get('version')!r}"
        )
    return registry
