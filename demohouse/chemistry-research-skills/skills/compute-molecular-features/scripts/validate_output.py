#!/usr/bin/env python3
"""校验 compute-molecular-features 输出契约和科学失败关闭规则。"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


def load_output_contract() -> Any:
    path = Path(__file__).with_name("feature_output_contract.py")
    spec = importlib.util.spec_from_file_location(
        "feature_output_validator_contract",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载输出合同：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OUTPUT_CONTRACT = load_output_contract()
output_fingerprint = OUTPUT_CONTRACT.output_fingerprint


def validate(document: Any) -> dict[str, Any]:
    errors, warnings = OUTPUT_CONTRACT.validate_document(document)
    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    try:
        document = json.loads(
            args.path.read_text(encoding="utf-8"),
            parse_constant=lambda value: float(value),
        )
        report = validate(document)
    except (OSError, json.JSONDecodeError) as error:
        report = {
            "valid": False,
            "errors": [str(error)],
            "warnings": [],
        }
    sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
