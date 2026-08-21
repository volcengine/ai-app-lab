"""Controlled node and Validator mappings for execution-key reconstruction."""

VALIDATORS = {
    "identity-validation": (
        "identity-result",
        "skills/resolve-chemical-identities/scripts/validate_output.py",
    ),
    "standardize-validation": (
        "standardized-structures",
        "skills/standardize-chemical-structures/scripts/validate_output.py",
    ),
    "features-validation": (
        "molecular-features",
        "skills/compute-molecular-features/scripts/validate_output.py",
    ),
    "library-validation": (
        "library-operation",
        "skills/search-and-curate-chemical-libraries/scripts/validate_output.py",
    ),
}
NODE_ADAPTERS = {
    "resolve-identities": "resolve-chemical-identities-v1",
    "standardize-structures": "standardize-chemical-structures-v1",
    "compute-features": "compute-molecular-features-v1",
    "optional-library-operation": "search-and-curate-chemical-libraries-v1",
}
NODE_UPSTREAM = {
    "resolve-identities": (),
    "standardize-structures": (
        "standardization-input",
        "standardization-input-binding",
    ),
    "compute-features": (
        "standardized-structures",
        "calculation-view-selection",
    ),
    "optional-library-operation": ("molecular-features",),
}
