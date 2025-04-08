
from typing import Any, Dict
import mcp.types as mcp_types

from arkitect.core.component.llm.model import ChatCompletionTool, FunctionDefinition


def convert_schema(input_shema: Dict[str, Any], param_descriptions: Dict[str, str]={}) -> Dict[str, Any]:
    properties = input_shema["properties"]
    for key, val in properties.items():
        if "description" not in val:
            val["description"] = param_descriptions.get(key, "")
        properties[key] = val
    return input_shema


def create_chat_completion_tool(mcp_tool: mcp_types.Tool, param_descriptions: Dict[str, str]={}) -> ChatCompletionTool:
    t = ChatCompletionTool(
        type="function",
        function=FunctionDefinition(
            name=mcp_tool.name,
            description=mcp_tool.description,
            parameters=convert_schema(mcp_tool.inputSchema, param_descriptions),
        ),
    )
    return t


def create_tool_response(mcp_tool_result: mcp_types.CallToolResult) -> str:
    message_parts =[]
    for part in mcp_tool_result.content:
        if (isinstance(part, mcp_types.TextContent)):
            message_parts.append(part.text)
        else:
            raise NotImplementedError("Non-text tool response not supported")
    return "\n".join(message_parts)
