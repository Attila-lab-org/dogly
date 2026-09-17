"""Export the versioned knowledge snapshot for backup / audit."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.knowledge.breed_resolver import breed_catalog
from app.knowledge.intelligence_v3 import document_checksum, export_document


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "backend" / "app" / "knowledge" / "data" / "intelligence_v3_export.json"
    payload = {
        "checksum": document_checksum(),
        "intelligence": export_document(),
        "breeds": [record.model_dump(mode="json") for record in breed_catalog()],
    }
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
