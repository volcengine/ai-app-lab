"""Workflow B Evidence Index classifications and upstream bindings."""

from __future__ import annotations


VALIDATORS = {
    "curate-validation",
    "route-discovery-validation",
    "route-review-validation",
}
SKILL_OUTPUTS = {
    "curated-reactions",
    "route-discovery",
    "route-review",
}
STATIC_UPSTREAM = {
    "curate-validation": ("reaction-input",),
    "curated-reactions": ("curate-validation", "reaction-input"),
    "route-discovery-validation": ("route-input",),
    "route-discovery": ("route-discovery-validation", "route-input"),
    "route-steps": ("route-discovery",),
    "curation-bindings": ("route-steps", "curated-reactions"),
    "step-search-plan": (
        "route-steps",
        "curation-bindings",
        "curated-reactions",
    ),
    "assembled-step-artifacts": (
        "step-search-results",
        "curation-bindings",
        "curated-reactions",
    ),
    "route-review-request": ("route-input", "assembled-step-artifacts"),
    "route-review-validation": (
        "route-review-request",
        "assembled-step-artifacts",
    ),
    "route-review": (
        "route-review-validation",
        "route-review-request",
        "assembled-step-artifacts",
    ),
    "expert-review-package": ("route-review",),
}


def _numbered_suffix(logical_name: str, prefix: str) -> str | None:
    if not logical_name.startswith(prefix):
        return None
    suffix = logical_name.removeprefix(prefix)
    return suffix if len(suffix) == 4 and suffix.isdigit() else None


def _search_output(logical_name: str) -> str | None:
    return _numbered_suffix(logical_name, "precedent-search-")


def evidence_type(logical_name: str) -> str | None:
    if (
        logical_name in VALIDATORS
        or _numbered_suffix(
            logical_name,
            "precedent-search-validation-",
        )
        is not None
    ):
        return "validator_report"
    if logical_name in SKILL_OUTPUTS or _search_output(logical_name) is not None:
        return "validated_skill_artifact"
    return None


def upstream_names(
    logical_name: str,
    available_names: set[str],
) -> tuple[str, ...]:
    suffix = _numbered_suffix(
        logical_name,
        "precedent-search-request-",
    )
    if suffix is not None:
        return ("step-search-plan", "curated-reactions")
    suffix = _numbered_suffix(
        logical_name,
        "precedent-search-validation-",
    )
    if suffix is not None:
        return (
            f"precedent-search-request-{suffix}",
            "curated-reactions",
        )
    suffix = _search_output(logical_name)
    if suffix is not None:
        return (
            f"precedent-search-validation-{suffix}",
            f"precedent-search-request-{suffix}",
            "curated-reactions",
        )
    if logical_name == "step-search-results":
        outputs = sorted(
            name for name in available_names if _search_output(name) is not None
        )
        return ("step-search-plan", *outputs)
    return STATIC_UPSTREAM.get(logical_name, ())
