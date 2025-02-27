import os
from contextlib import AsyncExitStack
from typing import Optional, Dict, Any, Union, List

from mcp import ClientSession, Tool, StdioServerParameters, stdio_client
from mcp.types import CallToolResult, TextContent
from volcenginesdkarkruntime.types.chat import ChatCompletionContentPartParam

from arkitect.core.component.context.context import Context
from arkitect.core.component.llm.model import ChatCompletionTool, FunctionDefinition
from arkitect.core.component.tool import ToolManifest, ArkToolResponse
from arkitect.telemetry.trace import task


class MCPClient:
    def __init__(self):
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.tools: Dict[str, ToolManifest] = {}

    async def connect_to_server(self, server_script_path: str):
        server_params = StdioServerParameters(
            command=os.environ.get("PYTHON_EXECUTABLE", "python"),
            args=[server_script_path],
            env={
                "VOLC_ACCESSKEY": os.environ.get("VOLC_ACCESSKEY"),
                "VOLC_SECRETKEY": os.environ.get("VOLC_SECRETKEY"),
                "ARK_API_KEY": os.environ.get("ARK_API_KEY"),
            }
        )
        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        self.stdio, self.write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))
        await self.session.initialize()
        response = await self.session.list_tools()
        print("\nConnected to server with tools:", [tool.name for tool in response.tools])
        self.tools = convert_mcp_tools_to_manifests(self.session, response.tools)

    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()

    async def chat(self, model: str):
        async with Context(model=model, tools=self.tools) as ctx:
            query = input()
            completion = await ctx.completions.create(messages=[{
                "role": "user",
                "content": query,
            }], stream=True)
            async for chunk in completion:
                yield chunk


class MCPTool(ToolManifest):
    session: ClientSession
    tool: Tool

    @task()
    async def executor(
            self, parameters: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Union[ArkToolResponse, List[ChatCompletionContentPartParam]]:
        result: CallToolResult = await self.session.call_tool(self.tool_name, parameters)
        content_part: List[ChatCompletionContentPartParam] = []
        if result.content and isinstance(result.content[0], TextContent):
            content_part.append({
                "type": "text",
                "text": result.content[0].text,
            })
        return content_part

    def tool_schema(self) -> ChatCompletionTool:
        definition = self.tool.model_dump()
        value = definition.pop("inputSchema")
        definition["parameters"] = value
        return ChatCompletionTool(
            type="function", function=FunctionDefinition(**definition)
        )


def convert_mcp_tools_to_manifests(session: ClientSession, tools: List[Tool]) -> Dict[str, ToolManifest]:
    return {t.name + "/" + t.name: MCPTool(action_name=t.name, tool_name=t.name, tool=t, session=session, description=t.description)
            for t in tools}
