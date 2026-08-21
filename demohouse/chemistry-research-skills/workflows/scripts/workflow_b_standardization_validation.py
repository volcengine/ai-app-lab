"""Workflow B declared standardization Artifact binding validation."""

from __future__ import annotations

from typing import Any


def standardization_errors(
    request: dict[str, Any],
    documents_by_name: dict[str, dict[str, Any]],
) -> list[str]:
    declared_count = len(request["inputs"]["standardization_artifacts"])
    names = sorted(
        name for name in documents_by_name if name.startswith("standardization-input-")
    )
    if len(names) != declared_count:
        return ["declared standardization Artifact coverage is invalid"]
    if not names:
        return []
    upstream = documents_by_name["reaction-input"].get("upstream_artifacts")
    if not isinstance(upstream, list):
        return ["reaction input standardization binding is invalid"]
    stored = [documents_by_name[name] for name in names]
    return (
        ["declared standardization Artifacts do not match reaction input"]
        if stored != upstream
        else []
    )
