import argparse
import logging

from mcp_server_speech.server import mcp

logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Run the Speech MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )

    args = parser.parse_args()
    mcp.transport = args.transport  # Store transport on mcp object

    try:
        logger.info(f"Starting Speech MCP Server with transport: {mcp.transport}")
        mcp.run(transport=mcp.transport)
    except KeyboardInterrupt:
        logger.info("Speech MCP Server stopped by user.")
    except Exception as e:
        logger.error(f"Error starting Speech MCP Server: {str(e)}")
        raise


if __name__ == "__main__":
    main()
