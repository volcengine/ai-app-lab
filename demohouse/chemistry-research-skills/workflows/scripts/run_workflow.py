"""Start or resume a built-in chemistry workflow run."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


def _load_runner() -> Any:
    path = Path(__file__).with_name("workflow_runner.py")
    spec = importlib.util.spec_from_file_location(
        "run_workflow_runner",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_runner.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["run_workflow_runner"] = module
    spec.loader.exec_module(module)
    return module


RUNNER = _load_runner()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("start")
    start.add_argument("--request", required=True, type=Path)
    start.add_argument("--run-dir", required=True, type=Path)
    resume = commands.add_parser("resume")
    resume.add_argument("--run-dir", required=True, type=Path)
    resume.add_argument("--decision", type=Path)
    return parser.parse_args()


def _result_json(result: Any) -> str:
    return json.dumps(
        {
            "run_id": result.run_id,
            "run_status": result.status,
            "run_dir": str(result.run_dir),
            "exit_code": result.exit_code,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def main() -> int:
    args = parse_args()
    repository_root = Path(__file__).resolve().parents[2]
    try:
        if args.command == "start":
            result = RUNNER.start_run(
                args.request,
                args.run_dir,
                repository_root,
            )
        else:
            result = RUNNER.resume_run(
                args.run_dir,
                repository_root,
                args.decision,
            )
    except RUNNER.RunnerError as error:
        print(f"workflow failed: {error}", file=sys.stderr)
        return 3
    print(_result_json(result))
    return result.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
