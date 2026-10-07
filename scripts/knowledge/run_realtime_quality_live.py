"""Run the six realtime quality scenarios against the configured reasoner."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import Settings
from app.domains.realtime_context import RealtimeContextItem, RealtimeDogContext
from app.domains.realtime_orchestrator import orchestrate_realtime_turn
from app.knowledge.realtime_quality import RealtimeQualityLabel, score_realtime_quality

EVALS = ROOT / "backend" / "tests" / "evals" / "realtime_quality.jsonl"
REPORT = ROOT / "reports" / "realtime_quality_live.json"


def _context(case_id: str, dog_name: str) -> RealtimeDogContext:
    stable_facts = []
    items = []
    if case_id == "unknown_fact_kira":
        stable_facts = []
    elif case_id == "domain_change_bowie":
        items = [
            RealtimeContextItem(
                source_id="digestive-live-1",
                source_type="DIGESTIVE_EVENT",
                occurred_at=datetime(2026, 1, 5, tzinfo=UTC),
                summary="Episodio digestivo osservato",
                data={"headline": "Dopo cena"},
            )
        ]
    else:
        stable_facts = [
            {"source_id": f"fact-{case_id}", "key": "food", "value": "pollo e riso"}
        ]
    return RealtimeDogContext(
        dog_id=f"eval-{case_id}",
        dog_name=dog_name,
        identity={"source": "offline_eval"},
        stable_facts=stable_facts,
        items=items,
    )


async def _run() -> dict[str, object]:
    os.environ["REALTIME_ENABLED"] = "true"
    settings = Settings(realtime_enabled=True)
    cases = [json.loads(line) for line in EVALS.read_text(encoding="utf-8").splitlines()]
    results = []
    labels = []
    for case in cases:
        context = _context(case["id"], case["dog_name"])
        history: list[dict[str, str]] = []
        decision = None
        metadata = {}
        for turn in case["turns"]:
            decision, metadata = await orchestrate_realtime_turn(
                settings=settings,
                user_text=turn,
                domains=["GENERAL"],
                context=context,
                history=history,
            )
            history.extend(
                [
                    {"role": "user", "content": turn},
                    {"role": "assistant", "content": decision.assistant_text},
                ]
            )
        assert decision is not None
        answer = decision.assistant_text
        allowed_ids = {item.source_id for item in context.items}
        allowed_ids.update(str(fact["source_id"]) for fact in context.stable_facts)
        grounded = all(source_id in allowed_ids for source_id in decision.used_source_ids)
        correction_ok = case["id"] != "correction_nala" or "ansiosa" not in answer.lower()
        label = RealtimeQualityLabel(
            case_id=case["id"],
            answered_current_turn=bool(answer.strip()),
            handled_correction=correction_ok,
            maintained_continuity=(len(case["turns"]) == 1 or len(history) >= 2 * len(case["turns"])),
            grounded_in_context=grounded,
            natural_dialogue=("**" not in answer and "##" not in answer),
        )
        labels.append(label)
        results.append(
            {
                "id": case["id"],
                "dog_name": case["dog_name"],
                "response": answer,
                "used_source_ids": decision.used_source_ids,
                "provider": metadata.get("provider"),
                "rubric": label.dimensions(),
                "passed": label.passed,
            }
        )
    return {"score": score_realtime_quality(labels), "scenarios": results}


if __name__ == "__main__":
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(asyncio.run(_run()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {REPORT}")
