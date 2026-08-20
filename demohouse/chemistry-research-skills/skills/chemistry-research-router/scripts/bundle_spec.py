"""Static IDs and paths for chemistry Agent bundle V1."""

from pathlib import Path


SCHEMA_VERSION = "1.0.0"
BUNDLE_ID = "chemistry-research-agent-bundle"
HOST_ADAPTER_VERSION = "1.0.0"
SKILL_IDS = (
    "compute-molecular-features",
    "curate-reactions",
    "resolve-chemical-identities",
    "review-routes",
    "search-and-curate-chemical-libraries",
    "search-reactions",
    "standardize-chemical-structures",
)
SCHEMA_PATHS = (
    "attachment-manifest-v1.schema.json",
    "certification-record-v1.schema.json",
    "clarification-request-v1.schema.json",
    "research-intent-v1.schema.json",
    "route-confirmation-v1.schema.json",
    "route-decision-v1.schema.json",
    "router-execution-request-v1.schema.json",
)
CHAIN_IDS = (
    "identity-standardization-v1",
    "reaction-precedent-v1",
    "structure-features-v1",
    "structure-library-v1",
)
WORKFLOW_IDS = (
    "compound-evidence-v1",
    "route-evidence-review-v1",
)
HOST_SKILL_ROOTS = {
    "claude-code": ".claude/skills",
    "codex": ".agents/skills",
    "trae": ".trae/skills",
}
ROOT_FILES = ("pyproject.toml", "requirements-dev.txt", "uv.lock")
SOURCE_DIRECTORIES = (
    "skills",
    "workflows/definitions",
    "workflows/scripts",
    "orchestration/definitions",
)
IGNORED_PARTS = {"__pycache__", ".pytest_cache", ".ruff_cache"}
MANIFEST_RELATIVE_PATH = Path("orchestration/chemistry-agent-bundle-v1.json")
