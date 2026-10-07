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


def _context(case: dict[str, object]) -> RealtimeDogContext:
    evidence = [
        RealtimeContextItem(
            source_id=item["source_id"],
            source_type=item["source_type"],
            occurred_at=datetime(2026, 1, 5, tzinfo=UTC),
            summary=item["summary"],
            data=item.get("data", {}),
        )
        for item in case.get("evidence", [])
    ]
    return RealtimeDogContext(
        dog_id=f"eval-{case['id']}",
        dog_name=case["dog_name"],
        identity={"source": "offline_eval"},
        stable_facts=case.get("known_facts", []),
        items=evidence,
    )


async def _run() -> dict[str, object]:
    os.environ["REALTIME_ENABLED"] = "true"
    settings = Settings(realtime_enabled=True)
    cases = [json.loads(line) for line in EVALS.read_text(encoding="utf-8").splitlines()]
    results = []
    labels = []
    for case in cases:
        context = _context(case)
        history: list[dict[str, str]] = []
        decision = None
        metadata = {}
        transcript = []
        for turn in case["turns"]:
            history_before_turn = list(history)
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
            transcript.append(
                {
                    "input": turn,
                    "history": history_before_turn,
                    "response": decision.assistant_text,
                    "used_source_ids": decision.used_source_ids,
                    "provider": metadata.get("provider"),
                }
            )
        assert decision is not None
        answer = decision.assistant_text
        length_result = "fail" if len(answer) > 600 else "pass"
        label = RealtimeQualityLabel(
            case_id=case["id"],
            answered_current_turn="unmeasurable",
            handled_correction="unmeasurable",
            maintained_continuity="unmeasurable",
            grounded_in_context="unmeasurable",
            natural_dialogue=length_result,
        )
        labels.append(label)
        results.append(
            {
                "id": case["id"],
                "dog_name": case["dog_name"],
                "negative_control": case.get("negative_control", False),
                "response": answer,
                "used_source_ids": decision.used_source_ids,
                "provider": metadata.get("provider"),
                "rubric": label.dimensions(),
                "passed": label.passed,
                "response_length_chars": len(answer),
                "transcript": transcript,
            }
        )
    return {"score": score_realtime_quality(labels), "scenarios": results}


if __name__ == "__main__":
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(asyncio.run(_run()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {REPORT}")
