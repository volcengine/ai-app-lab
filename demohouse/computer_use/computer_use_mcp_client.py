import asyncio
import datetime
import json
from typing import Optional
from contextlib import AsyncExitStack
from mcp.client.sse import sse_client

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import ArkChatParameters, ArkMessage
from volcenginesdkarkruntime import AsyncArk
from arkitect.core.component.llm.utils import convert_response_message
from converter import create_chat_completion_tool, create_tool_response
from utils import pretty_print_message
from config import LLM_ENDPOINT, ARK_API_KEY


modelClient = AsyncArk(
    api_key=ARK_API_KEY,  # doubao 1.5
)

 

class MCPClient:
    def __init__(self):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()

    async def connect_to_stdio_server(self, server_script_path: str):
        """Connect to an MCP server

        Args:
            server_script_path: Path to the server script (.py or .js)
        """
        is_python = server_script_path.endswith(".py")
        is_js = server_script_path.endswith(".js")
        if not (is_python or is_js):
            raise ValueError("Server script must be a .py or .js file")

        command = "python" if is_python else "node"
        server_params = StdioServerParameters(
            command=command, args=[server_script_path], env=None
        )

        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        self.stdio, self.write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(self.stdio, self.write, read_timeout_seconds=datetime.timedelta(seconds=10))
        )

        await self.session.initialize()

        # List available tools
        response = await self.session.list_tools()
        tools = response.tools
        print("\nConnected to server with tools:", [tool.name for tool in tools])

    async def connect_to_sse_server(self, server_url: str):
        """Connect to an MCP server running with SSE transport"""
        # Store the context managers so they stay alive
        self._streams_context = sse_client(url=server_url)
        streams = await self._streams_context.__aenter__()

        self._session_context = ClientSession(*streams)
        self.session: ClientSession = await self._session_context.__aenter__()

        # Initialize
        await self.session.initialize()

        # List available tools to verify connection
        print("Initialized SSE client...")
        print("Listing tools...")
        response = await self.session.list_tools()
        tools = response.tools
        print("\nConnected to server with tools:", [tool.name for tool in tools])
    
    async def process_query(self, query: str) -> str:
        sp = "你是一个会使用代码工具和Bash命令行的助手，你需要通过使用工具完成用户给你的任务。如果任务不确定时，你应该向用户确认他的意图，当你认为可以执行时，生产对应的工具使用指令。在需要多步工具使用时，你需要记住你之前定下的计划和使用过的工具。如果计划有变动，请描述一下新的计划然后再继续使用工具执行任务"

        """Process a query using Claude and available tools"""
        messages = [
            ArkMessage(
                role="system",
                content=sp,
            ),
            ArkMessage(
                role="user",
                content=query,
            )
        ]
        for message in messages:
            pretty_print_message(message)

        response = await self.session.list_tools()
        available_tools = [create_chat_completion_tool(mcp_tool=tool) for tool in response.tools]
        parameters = ArkChatParameters()
        parameters.tools =available_tools

        # Initialize LLM
        llm = BaseChatLanguageModel(
            endpoint_id=LLM_ENDPOINT,
            messages=messages,
            parameters=parameters,
            client=modelClient,
        )
        response = await llm.arun()

        # Process response and handle tool calls
        tool_results = []
        final_text = []

        while response:
            msg = response.choices[0].message
            new_ark_message = convert_response_message(msg)
            pretty_print_message(new_ark_message)
            messages.append(new_ark_message)
            if msg.content:
                final_text.append(msg.content)

            if not msg.tool_calls:
                # no more tool calls, break
                break
            tool_calls = msg.tool_calls
            for tool_call in tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)
                # Execute tool call
                result = await self.session.call_tool(tool_name, tool_args)
                tool_results.append({"call": tool_name, "result": result})
                final_text.append(f"[Calling tool {tool_name} with args {tool_args}]")

            tool_response = ArkMessage(
                role="tool",
                tool_call_id=tool_call.id,
                content=create_tool_response(result)
            )
            pretty_print_message(tool_response)
            messages.append(tool_response)
            llm.messages = messages
            response = await llm.arun()
        return final_text

    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.")

        while True:
            try:
                query = input("\nQuery: ").strip()

                if query.lower() == "quit":
                    break

                await self.process_query(query)

            except Exception as e:
                print(f"\nError: {str(e)}")

    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()


async def main():
    server_url = "http://0.0.0.0:8000/sse"
    client = MCPClient()
    try:
        await client.connect_to_sse_server(server_url)
        await client.chat_loop()
    finally:
        await client.cleanup()


if __name__ == "__main__":
    import sys

    asyncio.run(main())
