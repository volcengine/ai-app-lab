"""
MCP Computer Use Server.

This server provides MCP tools to interact with Computer Use Agent.
"""

import argparse

from mcp_server.common.logs import LOG
from mcp_server.tools import computer
from mcp_server.tools import MCP


def main():
    parser = argparse.ArgumentParser(
        description="Run the Computer Use MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="sse",
        help="Transport protocol to use (sse or stdio)",
    )

    args = parser.parse_args()

    # Run the MCP server
    LOG.info(
        f"Starting Computer Use MCP Server with {args.transport} transport")

    MCP.run(transport=args.transport)


if __name__ == "__main__":
    main()
