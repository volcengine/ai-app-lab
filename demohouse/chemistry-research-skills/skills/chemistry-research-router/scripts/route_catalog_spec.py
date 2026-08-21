"""Static allowlists for Route Catalog V1."""

from pathlib import Path


CATALOG_PATH = Path("skills/chemistry-research-router/references/route-catalog-v1.json")
DEFINITION_ROOT = Path("orchestration/definitions")
CATALOG_FIELDS = {
    "schema_version",
    "catalog_version",
    "safe_defaults",
    "targets",
    "catalog_fingerprint",
}
TARGET_FIELDS = {
    "target_id",
    "target_type",
    "accepted_goal_types",
    "required_object_types",
    "required_input_roles",
    "required_operations",
    "forbidden_goals",
    "direct_entry_policy",
    "allowed_execution_modes",
    "safe_defaults",
    "priority",
    "catalog_version",
}
CHAIN_FIELDS = {
    "schema_version",
    "chain_id",
    "definition_version",
    "runtime_contract_version",
    "nodes",
    "edges",
    "gate_policies",
    "definition_fingerprint",
}
NODE_FIELDS = {"node_id", "handler_id", "needs"}
EXPECTED_SAFE_DEFAULTS = {
    "network_mode": "offline",
    "external_retry": "manual",
    "offline_identity_sources": [],
    "public_identity_sources": ["opsin", "pubchem", "chembl", "unichem"],
    "identity_include_related": False,
    "identity_timeout_seconds": 20,
    "identity_retries": 0,
    "standardization_profile": "chembl-pipeline",
    "calculation_view": "standardized",
    "library_fingerprint_profile_id": "rdkit-morgan-r2-2048-chiral1-bit-v1",
    "library_metric": "tanimoto",
    "library_top_k": 20,
    "library_include_review_required": False,
    "library_include_self": False,
    "reaction_provider": "local_curated_corpus",
    "reaction_operation": "lookup_reaction",
    "reaction_top_k": 20,
    "reaction_include_review_required": False,
    "reaction_use_stereochemistry": True,
}
TARGET_TYPES = {
    "resolve-chemical-identities": "direct_skill",
    "standardize-chemical-structures": "direct_skill",
    "compute-molecular-features": "direct_skill",
    "search-and-curate-chemical-libraries": "direct_skill",
    "curate-reactions": "direct_skill",
    "search-reactions": "direct_skill",
    "review-routes": "direct_skill",
    "identity-standardization-v1": "direct_skill_chain",
    "structure-features-v1": "direct_skill_chain",
    "structure-library-v1": "direct_skill_chain",
    "reaction-precedent-v1": "direct_skill_chain",
    "compound-evidence-v1": "workflow_a",
    "route-evidence-review-v1": "workflow_b",
}
ALLOWED_GOALS = {
    "resolve_identity",
    "standardize_structure",
    "compute_molecular_features",
    "search_or_curate_library",
    "curate_reaction",
    "search_reaction_precedent",
    "review_existing_routes",
    "build_compound_evidence",
    "build_route_evidence_review",
}
ALLOWED_OBJECT_TYPES = {
    "compound_name",
    "compound_identifier",
    "chemical_structure",
    "compound_collection",
    "reaction_record",
    "reaction_collection",
    "reaction_query",
    "route_record",
    "route_collection",
    "unknown_chemical_object",
}
ALLOWED_INPUT_ROLES = {
    "compound_input",
    "structure_input",
    "library_input",
    "features_input",
    "reaction_input",
    "reaction_collection_input",
    "route_input",
    "route_collection_input",
    "standardization_input",
    "curation_input",
    "precedent_input",
}
ALLOWED_OPERATIONS = {
    "resolve_identity",
    "standardize_structure",
    "compute_descriptors",
    "compute_fingerprint",
    "search_similarity",
    "search_substructure",
    "cluster_library",
    "select_diverse_compounds",
    "curate_library",
    "curate_reaction",
    "search_reaction_precedent",
    "review_existing_routes",
}
FORBIDDEN_GOALS = [
    "toxicity_prediction",
    "experimental_safety_approval",
    "scale_up_approval",
    "route_generation",
    "autonomous_experiment",
    "structure_prediction",
]
EXPECTED_CHAIN_EDGES = {
    "identity-standardization-v1": [
        ["resolve-identities", "identity-gate"],
        ["identity-gate", "build-standardization-input"],
        ["build-standardization-input", "standardize-structures"],
        ["standardize-structures", "validate-chain"],
    ],
    "structure-features-v1": [
        ["standardize-structures", "calculation-view-gate"],
        ["calculation-view-gate", "compute-features"],
        ["compute-features", "validate-chain"],
    ],
    "structure-library-v1": [
        ["standardize-structures", "calculation-view-gate"],
        ["calculation-view-gate", "compute-features"],
        ["compute-features", "library-operation"],
        ["library-operation", "validate-chain"],
    ],
    "reaction-precedent-v1": [
        ["curate-reactions", "search-reactions"],
        ["search-reactions", "validate-chain"],
    ],
}
EXPECTED_GATE_POLICIES = {
    "identity-standardization-v1": {
        "identity-gate": {"gate_type": "identity_resolution"}
    },
    "structure-features-v1": {
        "calculation-view-gate": {"gate_type": "calculation_view"}
    },
    "structure-library-v1": {
        "calculation-view-gate": {"gate_type": "calculation_view"}
    },
    "reaction-precedent-v1": {},
}
