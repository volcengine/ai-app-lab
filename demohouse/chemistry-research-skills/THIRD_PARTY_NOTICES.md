# Third-Party Notices

This document records the third-party software directly required by the repository and the external services or datasets referenced by its Skills.

The repository does not redistribute the external datasets listed below. Runtime results remain subject to their original source terms.

## Direct Software Dependencies

| Component | Pinned version | License | Use |
|---|---:|---|---|
| [RDKit](https://github.com/rdkit/rdkit/tree/Release_2025_09_2) | `2025.9.2` | [BSD-3-Clause](https://github.com/rdkit/rdkit/blob/Release_2025_09_2/license.txt) | Structure parsing, standardization, descriptors, fingerprints and graph operations |
| [ChEMBL Structure Pipeline](https://github.com/chembl/ChEMBL_Structure_Pipeline) | `1.2.4` | [MIT](https://github.com/chembl/ChEMBL_Structure_Pipeline/blob/master/LICENSE) | ChEMBL structure checking, standardization and parent extraction |
| [ORD Schema](https://github.com/open-reaction-database/ord-schema) | `0.8.3` | [Apache-2.0](https://github.com/open-reaction-database/ord-schema/blob/main/LICENSE) | Open Reaction Database protobuf schema and validation |

The dependency licenses apply to those components. They are not replaced by this repository's Apache-2.0 license.

## External Services

`resolve-chemical-identities` may call:

- [OPSIN Web API](https://www.ebi.ac.uk/opsin/), whose software is released under the MIT License;
- [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest);
- [ChEMBL Data Web Services](https://chembl.gitbook.io/chembl-interface-documentation/);
- [UniChem API](https://chembl.gitbook.io/unichem/api).

`search-reactions` may call:

- [Open Reaction Database API](https://open-reaction-database.org/).

The repository does not grant rights to these services or their returned records. Users must review the current service and source-specific terms before storing or redistributing results. Online requests may disclose query names or structures to the service operator.

## Referenced Data

| Dataset | License | Repository treatment |
|---|---|---|
| [Open Reaction Database data](https://github.com/open-reaction-database/ord-data) | `CC-BY-SA-4.0` | Not bundled; runtime records retain source identifiers and license metadata |
| [PaRoutes 2.0 dataset](https://doi.org/10.5281/zenodo.7341155) | `CC-BY-4.0` | Not bundled; the Skill only implements an input adapter |

No Agent Plan outputs, internal evaluation results, PaRoutes-derived candidate packs, or ORD dataset exports are included in the public repository.

## Test Data

Committed tests use hand-authored synthetic records and small, commonly known chemical structures. They do not include the internal routing evaluation set or third-party dataset extracts used during private development.
