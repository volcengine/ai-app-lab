import argparse
import logging
import os

from lark_oapi.api.im.v1 import *
from mcp.server.fastmcp import FastMCP

from mcp_server_lark.config import load_config
from mcp_server_lark.lark_client import LarkClient

logger = logging.getLogger(__name__)

config = None
lark_client = None

# Create server
mcp = FastMCP("Lark Server", port=int(os.getenv("PORT", "8000")))


@mcp.tool()
def create_document(document_name: str, dest_folder_token: str | None = None) -> str:
    """Create a lark document

    Args:
        document_name (str): the document name
        dest_folder_token (str, optional): the folder's id where you want to place the document. Defaults to config.dest_folder_token.

    Returns:
        str: created document id
    """
    if not dest_folder_token:
        dest_folder_token = config.dest_folder_token
    response = lark_client.create_doc(document_name, dest_folder_token)
    if not response:
        print(response)
        return "Failed to create document."
    return response.data.document.document_id


@mcp.tool()
def write_document_text(document_id: str, body: str):
    """Write text to a lark document

    Args:
        document_id (str): lark document id
        body (str): body content
    """
    return lark_client.write_doc_text(document_id, body)


@mcp.tool()
def send_message(message: str, contact_name: str) -> CreateMessageResponse:
    """Send a message to a contact

    Args:
        message (str): message content
        contact_name (str): contact name
    """
    return lark_client.send_message(message, contact_name)


def main():
    parser = argparse.ArgumentParser(description="Run the Lark MCP Server")
    parser.add_argument(
        "--transport",
        "--t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )
    parser.add_argument(
        "--config", "--c", required=True, help="The path to the config file"
    )

    args = parser.parse_args()

    global config
    global lark_client
    config = load_config(args.config)
    lark_client = LarkClient(
        lark_app_id=config.app_id,
        lark_secret_key=config.app_secret,
        contact_list=config.contact_list,
    )

    mcp.run(transport=args.transport)


if __name__ == "__main__":
    main()
