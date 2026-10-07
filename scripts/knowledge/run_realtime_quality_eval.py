"""Validate the offline realtime quality scenario suite."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVALS = ROOT / "backend" / "tests" / "evals" / "realtime_quality.jsonl"
REQUIRED_IDS = {
    "correction_nala",
    "yesterday_bruno",
    "affection_luna",
    "domain_change_bowie",
    "unknown_fact_kira",
    "long_context_otto",
}


def main() -> int:
    cases = [json.loads(line) for line in EVALS.read_text(encoding="utf-8").splitlines()]
    ids = {case["id"] for case in cases}
    if ids != REQUIRED_IDS or any(len(case["turns"]) == 0 for case in cases):
        print("realtime_quality_eval=invalid")
        return 1
    if any(case["dog_name"] in {"Oreo", "Rocky"} for case in cases):
        print("realtime_quality_eval=invalid_demo_bias")
        return 1
    print(f"realtime_quality_eval=valid scenarios={len(cases)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
