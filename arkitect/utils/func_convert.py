# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import inspect
from typing import Any, Callable, Dict, Mapping, Optional, Sequence

import pydantic

### The following methods are utils to convert a python function to ChatCompletionTool
### The implementation references: https://github.com/google-gemini/generative-ai-python/blob/main/google/generativeai/types/content_types.py#L584


def schema_for_function(
    f: Callable[..., Any],
    *,
    param_descriptions: Mapping[str, str] = {},
    required: Optional[Sequence[str]] = None,
) -> Dict:
    defaults = dict(inspect.signature(f).parameters)
    fields_dict = {}
    for name, param in defaults.items():
        if param.kind in (
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
            inspect.Parameter.POSITIONAL_ONLY,
        ):
            default_value = (
                param.default if param.default != inspect.Parameter.empty else None
            )
            field = pydantic.Field(
                description=param_descriptions.get(name, None),
                default=default_value,
            )

            if param.annotation != inspect.Parameter.empty:
                fields_dict[name] = param.annotation, field
            else:
                fields_dict[name] = Any, field

    parameters = _build_schema(f.__name__, fields_dict)
    schema: Dict[str, Any] = {}
    schema["name"] = f.__name__
    schema["description"] = f.__doc__ if f.__doc__ else ""
    # 6. Annotate required fields.
    if required is not None:
        # We use the user-provided "required" fields if specified.
        parameters["required"] = required
    else:
        # Otherwise we infer it from the function signature.
        parameters["required"] = [
            k
            for k in defaults
            if (
                defaults[k].default == inspect.Parameter.empty
                and defaults[k].kind
                in (
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    inspect.Parameter.KEYWORD_ONLY,
                    inspect.Parameter.POSITIONAL_ONLY,
                )
            )
        ]
    if parameters["properties"]:
        schema["parameters"] = parameters
    return schema


def unpack_defs(schema: Dict, defs: Dict) -> None:
    properties = schema.get("properties", None)
    if properties is None:
        return

    for name, value in properties.items():
        ref_key = value.get("$ref", None)
        if ref_key is not None:
            ref = defs[ref_key.split("defs/")[-1]]
            unpack_defs(ref, defs)
            properties[name] = ref
            continue

        anyof = value.get("anyOf", None)
        if anyof is not None:
            for i, atype in enumerate(anyof):
                ref_key = atype.get("$ref", None)
                if ref_key is not None:
                    ref = defs[ref_key.split("defs/")[-1]]
                    unpack_defs(ref, defs)
                    anyof[i] = ref
            continue

        items = value.get("items", None)
        if items is not None:
            ref_key = items.get("$ref", None)
            if ref_key is not None:
                ref = defs[ref_key.split("defs/")[-1]]
                unpack_defs(ref, defs)
                value["items"] = ref
                continue


def strip_titles(schema: Dict) -> None:
    _ = schema.pop("title", None)

    properties = schema.get("properties", None)
    if properties is not None:
        for name, value in properties.items():
            strip_titles(value)

    items = schema.get("items", None)
    if items is not None:
        strip_titles(items)


def convert_to_nullable(schema: Dict) -> None:
    anyof = schema.pop("anyOf", None)
    if anyof is not None:
        if len(anyof) != 2:
            raise ValueError(
                "Invalid input: Type Unions are not supported,"
                "except for `Optional` types. "
                "Please provide an `Optional` type or a non-Union type."
            )
        a, b = anyof
        if a == {"type": "null"}:
            schema.update(b)
        elif b == {"type": "null"}:
            schema.update(a)
        else:
            raise ValueError(
                "Invalid input: Type Unions are not supported,"
                "except for `Optional` types. "
                "Please provide an `Optional` type or a non-Union type."
            )
        schema["nullable"] = True

    properties = schema.get("properties", None)
    if properties is not None:
        for name, value in properties.items():
            convert_to_nullable(value)

    items = schema.get("items", None)
    if items is not None:
        convert_to_nullable(items)


def add_object_type(schema: Dict) -> None:
    properties = schema.get("properties", None)
    if properties is not None:
        schema.pop("required", None)
        schema["type"] = "object"
        for name, value in properties.items():
            add_object_type(value)

    items = schema.get("items", None)
    if items is not None:
        add_object_type(items)


def _build_schema(fname: str, fields_dict: Dict) -> Dict:
    parameters = pydantic.create_model(fname, **fields_dict).model_json_schema()
    defs = parameters.pop("$defs", {})
    # flatten the defs
    for name, value in defs.items():
        unpack_defs(value, defs)
    unpack_defs(parameters, defs)

    # 5. Nullable fields:
    #     * https://github.com/pydantic/pydantic/issues/1270
    #     * https://stackoverflow.com/a/58841311
    #     * https://github.com/pydantic/pydantic/discussions/4872
    convert_to_nullable(parameters)
    add_object_type(parameters)
    # Postprocessing
    # 4. Suppress unnecessary title generation:
    #    * https://github.com/pydantic/pydantic/issues/1051
    #    * http://cl/586221780
    strip_titles(parameters)
    return parameters
