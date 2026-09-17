"""Darwin's Ark / Morrill import.

CI uses the local fixture. A full Dryad dump is opt-in and never on the
request path. Claims stay curated in-repo; this script only validates
that fixture rows do not invent aggression or named-breed destiny.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "backend" / "tests" / "fixtures" / "darwins_ark_sample.csv"

FORBIDDEN = (
    "is aggressive",
    "dangerous breed",
    "bite risk",
    "must be aggressive",
    "always aggressive",
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", default=str(FIXTURE))
    parser.add_argument("--download", action="store_true", help="Reserved; CI must not download GBs.")
    args = parser.parse_args()
    if args.download:
        print("Full Dryad download is operator-only and not part of CI.", file=sys.stderr)
        return 2
    path = Path(args.fixture)
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        print("empty fixture", file=sys.stderr)
        return 1
    for row in rows:
        blob = json.dumps(row, ensure_ascii=False).lower()
        if any(token in blob for token in FORBIDDEN):
            print(f"forbidden language in {row}", file=sys.stderr)
            return 1
    print(f"validated {len(rows)} fixture rows from {path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
