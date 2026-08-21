"""Dataset profile and summary invariants."""

from __future__ import annotations

import math
from typing import Any


CALCULATION_STATUSES = {"completed", "partial", "not_run", "error"}
DISPOSITIONS = {"ready_for_downstream", "review_required", "rejected"}


def _count_matches(value: Any, expected: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value == expected


def _count_mapping_matches(value: Any, expected: dict[str, int]) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == set(expected)
        and all(_count_matches(value[key], count) for key, count in expected.items())
    )


def _statistics_errors(
    statistics: Any,
    records: list[dict[str, Any]],
    descriptor_names: set[str],
) -> list[str]:
    if not isinstance(statistics, dict) or set(statistics) != descriptor_names:
        return ["dataset_profile.descriptor_statistics does not match descriptor_set"]
    errors = []
    for name, stats in statistics.items():
        path = f"dataset_profile.descriptor_statistics.{name}"
        if not isinstance(stats, dict):
            errors.append(f"{path} must be an object")
            continue
        if not _count_matches(stats.get("total_records"), len(records)):
            errors.append(f"{path}.total_records does not match records")
        missing = stats.get("missing_count")
        non_missing = stats.get("non_missing_count")
        if (
            isinstance(missing, bool)
            or isinstance(non_missing, bool)
            or not isinstance(missing, int)
            or not isinstance(non_missing, int)
        ):
            errors.append(f"{path} missing/non-missing counts must be integers")
            continue
        if missing + non_missing != len(records):
            errors.append(f"{path} counts do not conserve total records")
        expected_rate = missing / len(records) if records else None
        rate = stats.get("missing_rate")
        if expected_rate is not None and (
            isinstance(rate, bool)
            or not isinstance(rate, (int, float))
            or not math.isclose(
                float(rate),
                expected_rate,
                rel_tol=0.0,
                abs_tol=1e-15,
            )
        ):
            errors.append(f"{path}.missing_rate does not match counts")
    return errors


def dataset_errors(
    profile: Any,
    records: list[dict[str, Any]],
    descriptor_names: set[str],
) -> list[str]:
    if not isinstance(profile, dict):
        return ["dataset_profile must be an object"]
    required = {
        "total_records",
        "calculation_status_counts",
        "disposition_counts",
        "descriptor_statistics",
        "constant_features",
        "near_constant_features",
        "duplicate_structures",
        "fingerprint_density_statistics",
        "human_review_count",
        "statistical_qc_parameters",
        "interpretation",
    }
    errors = [
        f"dataset_profile.{field} is required"
        for field in sorted(required - set(profile))
    ]
    if not _count_matches(profile.get("total_records"), len(records)):
        errors.append("dataset_profile.total_records does not match records")
    expected_statuses = {
        status: sum(record.get("calculation_status") == status for record in records)
        for status in CALCULATION_STATUSES
    }
    if not _count_mapping_matches(
        profile.get("calculation_status_counts"),
        expected_statuses,
    ):
        errors.append(
            "dataset_profile.calculation_status_counts does not match records"
        )
    expected_dispositions = {
        status: sum(record.get("disposition") == status for record in records)
        for status in DISPOSITIONS
    }
    if not _count_mapping_matches(
        profile.get("disposition_counts"),
        expected_dispositions,
    ):
        errors.append("dataset_profile.disposition_counts does not match records")
    if not _count_matches(
        profile.get("human_review_count"),
        expected_dispositions["review_required"],
    ):
        errors.append("dataset_profile.human_review_count does not match records")
    errors.extend(
        _statistics_errors(
            profile.get("descriptor_statistics"),
            records,
            descriptor_names,
        )
    )
    return errors


def summary_errors(
    summary: Any,
    records: list[dict[str, Any]],
) -> list[str]:
    if not isinstance(summary, dict):
        return ["input_summary must be an object"]
    expected_statuses = {
        status: sum(
            isinstance(record, dict) and record.get("calculation_status") == status
            for record in records
        )
        for status in CALCULATION_STATUSES
    }
    expected_dispositions = {
        status: sum(
            isinstance(record, dict) and record.get("disposition") == status
            for record in records
        )
        for status in DISPOSITIONS
    }
    errors = []
    if not _count_matches(summary.get("total_records"), len(records)):
        errors.append("input_summary.total_records does not match records")
    if not _count_mapping_matches(
        summary.get("calculation_status_counts"),
        expected_statuses,
    ):
        errors.append("input_summary.calculation_status_counts does not match records")
    if not _count_mapping_matches(
        summary.get("output_disposition_counts"),
        expected_dispositions,
    ):
        errors.append("input_summary.output_disposition_counts does not match records")
    if sum(expected_dispositions.values()) != len(records):
        errors.append("record dispositions do not conserve input count")
    return errors
