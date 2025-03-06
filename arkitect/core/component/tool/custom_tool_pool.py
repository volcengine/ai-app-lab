from typing import Any, Callable
from arkitect.core.component.tool.mcp_tool_pool import MCPToolPool
from mcp.server.fastmcp import FastMCP
from typing import Dict
from mcp import Tool


class CustomToolPool(MCPToolPool):
    def __init__(self, name: str | None = None):
        self._name = name if name else "CustomToolPool"
        self.session = FastMCP()
        self.tools: Dict[str, Tool] = {}
        self._chat_completion_tools = {}

    @property
    def name(self) -> str:
        return self._name

    def add_tool(
        self,
        fn: Callable[..., Any],
        name: str | None = None,
        description: str | None = None,
    ) -> None:
        self.session.add_tool(
            func=fn, name=name, description=description, param_description={}
        )

    def tool(
        self, name: str | None = None, description: str | None = None
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        return self.session.tool(name=name, description=description)

    async def connect_to_server(
        self,
        server_url: str | None = None,
        server_script_path: str | None = None,
        env: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 5,
        sse_read_timeout: float = 60 * 5,
    ):
        """Nothing to do"""
        return
