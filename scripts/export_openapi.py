#!/usr/bin/env python3
"""Export the public OpenAPI contract (Spec V1 sez. 3.1 / 28.1).

Usage:
    python scripts/export_openapi.py [--out docs/openapi.json]

FastAPI/Pydantic is the source of truth for the mobile client contract; CI
fails on uncommitted contract drift.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.api.app import create_app  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(REPO_ROOT / "docs" / "openapi.json"))
    args = parser.parse_args()

    app = create_app()
    schema = app.openapi()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(schema, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(f"OpenAPI written to {out_path} ({len(schema.get('paths', {}))} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
