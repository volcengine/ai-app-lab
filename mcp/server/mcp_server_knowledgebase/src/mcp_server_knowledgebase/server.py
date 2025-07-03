#!/usr/bin/env python3
# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import argparse
import logging
import os
from typing import Dict, Optional

from volcengine.viking_knowledgebase import VikingKnowledgeBaseService

from mcp_server_knowledgebase.config import config
from mcp.server.fastmcp import FastMCP

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global variables
viking_knowledgebase_service = None

# Create MCP server
mcp = FastMCP("Viking Knowledge Base Server", port=int(os.getenv("PORT", "8000")))


@mcp.tool()
def search_knowledge(
    query: str,
    limit: int = 3,
    collection_name: str = "",
) -> Dict:
    """Search knowledge from the Viking Knowledge Base Service.
    This tool searches for knowledge in the configured collection based on the provided query.

    Args:
        query: The search query string.
        limit: Maximum number of results to return (default: 3).
        collection_name: knowledge base collection name to search knowledge. If not provided, uses the globally configured collection.
    """
    logger.info(f"Received search_knowledge request with query: {query}")

    try:
        logger.info(f"Searching knowledge with query: {query}, limit: {limit}")
        collection_name = config.collection_name or collection_name

        if not collection_name:
            raise ValueError("Collection name is required")
        result = viking_knowledgebase_service.search_knowledge(
            collection_name=collection_name,
            query=query,
            limit=limit,
            dense_weight=0.5,
        )

        return result.get("result_list")

    except Exception as e:
        logger.error(f"Error in search_knowledge: {str(e)}")
        return {"error": str(e)}


def main():
    """Main entry point for the MCP server."""
    parser = argparse.ArgumentParser(
        description="Run the Viking Knowledge Base MCP Server"
    )
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )

    args = parser.parse_args()

    try:
        # Initialize Viking Knowledge Base service
        global viking_knowledgebase_service
        viking_knowledgebase_service = VikingKnowledgeBaseService(
            host=config.host,
            scheme="https",
            connection_timeout=30,
            socket_timeout=30,
        )
        viking_knowledgebase_service.set_ak(config.ak)
        viking_knowledgebase_service.set_sk(config.sk)

        logger.info(
            f"Initialized Viking Knowledge Base service for host: {config.host}, collection: {config.collection_name}"
        )

        # Run the MCP server
        logger.info(
            f"Starting Viking Knowledge Base MCP Server with {args.transport} transport"
        )
        mcp.run(transport=args.transport)
    except Exception as e:
        logger.error(f"Error starting Viking Knowledge Base MCP Server: {str(e)}")
        raise


if __name__ == "__main__":
    main()
