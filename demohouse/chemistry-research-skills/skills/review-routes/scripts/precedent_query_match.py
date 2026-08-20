#!/usr/bin/env python3
"""Mode-specific Search query matching against one route step."""

from __future__ import annotations

from typing import Any


def _split_reaction(value: Any) -> tuple[list[str], list[str], list[str]] | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.count(">>") == 1:
        left, right = text.split(">>")
        middle = ""
    else:
        parts = text.split(">")
        if len(parts) != 3:
            return None
        left, middle, right = parts
    sides = tuple(
        [item for item in side.split(".") if item] for side in (left, middle, right)
    )
    return sides if sides[0] and sides[2] else None


def _reaction_object(value: Any, toolkit: dict[str, Any]) -> Any | None:
    sides = _split_reaction(value)
    if sides is None:
        return None
    canonical_sides = []
    for side in sides:
        values = []
        for structure in side:
            molecule = toolkit["Chem"].MolFromSmiles(structure)
            if molecule is None:
                return None
            values.append(
                toolkit["Chem"].MolToSmiles(
                    molecule,
                    canonical=True,
                    isomericSmiles=True,
                )
            )
        canonical_sides.append(".".join(sorted(values)))
    return toolkit["rdChemReactions"].ReactionFromSmarts(
        ">".join(canonical_sides),
        useSmiles=True,
    )


def _remove_reaction_stereo(reaction: Any, toolkit: dict[str, Any]) -> None:
    for count_method, template_method in (
        ("GetNumReactantTemplates", "GetReactantTemplate"),
        ("GetNumAgentTemplates", "GetAgentTemplate"),
        ("GetNumProductTemplates", "GetProductTemplate"),
    ):
        for index in range(getattr(reaction, count_method)()):
            template = getattr(reaction, template_method)(index)
            toolkit["Chem"].RemoveStereochemistry(template)
            template.UpdatePropertyCache(strict=False)


def _prepare_reaction(reaction: Any) -> None:
    for count_method, template_method in (
        ("GetNumReactantTemplates", "GetReactantTemplate"),
        ("GetNumAgentTemplates", "GetAgentTemplate"),
        ("GetNumProductTemplates", "GetProductTemplate"),
    ):
        for index in range(getattr(reaction, count_method)()):
            getattr(reaction, template_method)(index).UpdatePropertyCache(strict=False)


def _reaction_stereo_match(candidate: Any, query: Any) -> bool:
    for count_method, template_method in (
        ("GetNumReactantTemplates", "GetReactantTemplate"),
        ("GetNumProductTemplates", "GetProductTemplate"),
    ):
        candidates = [
            getattr(candidate, template_method)(index)
            for index in range(getattr(candidate, count_method)())
        ]
        for index in range(getattr(query, count_method)()):
            query_template = getattr(query, template_method)(index)
            if not any(
                item.HasSubstructMatch(query_template, useChirality=True)
                for item in candidates
            ):
                return False
    return True


def transformation_matches(
    artifact: dict[str, Any],
    step: dict[str, Any],
    toolkit: dict[str, Any],
) -> bool:
    query_value = artifact["query_interpretation"]["query"].get("reaction_smarts")
    if not isinstance(query_value, str) or not query_value:
        return False
    try:
        query = toolkit["rdChemReactions"].ReactionFromSmarts(query_value)
        candidate = _reaction_object(step.get("canonical_reaction"), toolkit)
    except Exception:
        return False
    if query is None or candidate is None:
        return False
    use_stereo = artifact["options"]["use_stereochemistry"]
    if use_stereo:
        _prepare_reaction(query)
        _prepare_reaction(candidate)
    else:
        _remove_reaction_stereo(query, toolkit)
        _remove_reaction_stereo(candidate, toolkit)
    try:
        matched = toolkit["rdChemReactions"].HasReactionSubstructMatch(
            candidate,
            query,
            includeAgents=False,
        )
    except Exception:
        return False
    if not matched or (use_stereo and not _reaction_stereo_match(candidate, query)):
        return False
    expected = [{"reaction_smarts": query_value}]
    return all(
        result["matched_constraints"] == expected for result in artifact["results"]
    )


def _molecule(value: Any, toolkit: dict[str, Any], *, smarts: bool = False) -> Any:
    if not isinstance(value, str) or not value:
        return None
    parser = toolkit["Chem"].MolFromSmarts if smarts else toolkit["Chem"].MolFromSmiles
    try:
        with toolkit["rdBase"].BlockLogs():
            return parser(value)
    except Exception:
        return None


def _component_matches(
    structures: list[str],
    predicate: dict[str, Any],
    use_chirality: bool,
    toolkit: dict[str, Any],
) -> bool:
    mode = predicate.get("mode")
    query = _molecule(predicate.get("pattern"), toolkit, smarts=mode == "smarts")
    if query is None:
        return False
    query_canonical = (
        None
        if mode == "smarts"
        else toolkit["Chem"].MolToSmiles(
            query,
            canonical=True,
            isomericSmiles=use_chirality,
        )
    )
    scores = []
    for value in structures:
        candidate = _molecule(value, toolkit)
        if candidate is None:
            continue
        if mode == "exact":
            current = toolkit["Chem"].MolToSmiles(
                candidate,
                canonical=True,
                isomericSmiles=use_chirality,
            )
            if current == query_canonical:
                return True
        elif mode in {"substructure", "smarts"}:
            if candidate.HasSubstructMatch(query, useChirality=use_chirality):
                return True
        elif mode == "similar":
            generator = toolkit["rdFingerprintGenerator"].GetMorganGenerator(
                radius=2,
                fpSize=2048,
                includeChirality=use_chirality,
            )
            scores.append(
                float(
                    toolkit["DataStructs"].TanimotoSimilarity(
                        generator.GetFingerprint(query),
                        generator.GetFingerprint(candidate),
                    )
                )
            )
    threshold = predicate.get("threshold")
    return bool(
        mode == "similar"
        and isinstance(threshold, (int, float))
        and not isinstance(threshold, bool)
        and scores
        and max(scores) >= threshold
    )


def components_match(
    artifact: dict[str, Any],
    step: dict[str, Any],
    toolkit: dict[str, Any],
) -> bool:
    sides = _split_reaction(step.get("canonical_reaction"))
    predicates = artifact["query_interpretation"]["query"].get("component_predicates")
    if sides is None or not isinstance(predicates, list) or not predicates:
        return False
    structures = {"input": sides[0], "output": sides[2]}
    use_chirality = artifact["options"]["use_stereochemistry"]
    for predicate in predicates:
        target = predicate.get("target") if isinstance(predicate, dict) else None
        if target not in structures or not _component_matches(
            structures[target],
            predicate,
            use_chirality,
            toolkit,
        ):
            return False
    return all(
        result["matched_constraints"] == predicates for result in artifact["results"]
    )
