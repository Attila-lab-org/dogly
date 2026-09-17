"""Offline fixture evals for Intelligence V3. No network, no LLM."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import ContextBucket
from app.domains.digestive_intelligence import DigestiveContext, build_digestive_intelligence
from app.domains.dog_context import build_dog_context
from app.domains.models import DogRec
from app.knowledge.breed_resolver import resolve_breed
from app.knowledge.retrieval import retrieve_evidence
from app.providers.mock import load_fixture
from datetime import UTC, datetime

EVALS = ROOT / "backend" / "tests" / "evals" / "intelligence_v3.jsonl"


def _dog(label, is_mix: bool) -> DogRec:
    return DogRec(
        id="eval-dog",
        owner_id="eval-user",
        name="Luna",
        breed_label=label,
        is_mix=is_mix,
        created_at=datetime.now(UTC),
    )


def main() -> int:
    failures = 0
    raw = load_fixture("observation.fixture.json")
    raw["body"]["rigidity_candidate"] = "yes"
    observation = ObservationContract.model_validate(raw)
    for line in EVALS.read_text(encoding="utf-8").splitlines():
        case = json.loads(line)
        expect = case["expect"]
        if case["domain"] == "behavior":
            resolved = resolve_breed(case.get("breed_label"), is_mix=bool(case.get("is_mix")))
            result = retrieve_evidence(
                observation,
                ContextBucket.HOME,
                build_dog_context(_dog(case.get("breed_label"), bool(case.get("is_mix")))),
            )
            ids = {card.card_id for card in result.cards}
            if resolved.prior_eligible != expect["prior_eligible"]:
                print(f"{case['id']}: prior_eligible {resolved.prior_eligible}")
                failures += 1
            if expect.get("forbidden_card") in ids:
                print(f"{case['id']}: unexpected {expect['forbidden_card']}")
                failures += 1
            if expect.get("required_card") and expect["required_card"] not in ids:
                print(f"{case['id']}: missing {expect['required_card']}")
                failures += 1
        elif case["domain"] == "digestive":
            result = build_digestive_intelligence(
                {
                    "image_quality": "sufficient",
                    "warnings": [],
                    "fecal_score_estimate": 6,
                    "consistency": "watery",
                    "fresh_blood_candidate": "none_observed",
                    "melena_candidate": "none_observed",
                    "foreign_material_candidate": "none_observed",
                },
                DigestiveContext(
                    dog_name="Rocky",
                    episode_count_7d=case["episode_count_7d"],
                    watery_count_7d=case["watery_count_7d"],
                ),
                longitudinal=True,
            )
            text = " ".join(result.possible_associations).lower()
            for needle in expect.get("must_include", []):
                if needle not in text:
                    print(f"{case['id']}: missing {needle!r}")
                    failures += 1
            for needle in expect.get("must_not_include", []):
                if needle in text:
                    print(f"{case['id']}: unexpected {needle!r}")
                    failures += 1
    print(f"evals_failed={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
