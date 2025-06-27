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
import time
from typing import Dict, List, Optional, Union

from mcp.server.fastmcp import FastMCP
from volcengine.tls.TLSService import TLSService

from mcp_server_tls.config import config
from mcp_server_tls.resources.text_analysis import (
    create_app_instance_resource,
    create_app_scene_meta_resource,
    describe_app_instances_resource,
    describe_session_answer_resource,
)
from mcp_server_tls.resources.tls_query import tls_query_resource

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global variables
tls_service = None
global_topic_id = None

# Create MCP server
mcp = FastMCP("TLS Log Search Server", port=int(os.getenv("PORT", "8000")))


@mcp.tool()
async def text_to_sql(
        question: str,
        topic_id: str = "",
        session_id: str = "",
) -> dict:
    """Convert natural language to Log query's specific SQL statement.

    This tool converts a given natural language question into a SQL query that can be used
    to search and analyze logs from the TLS(Toutiao Log Service). After executing the tool,
    you can use the returned SQL query to call the search_logs tool to retrieve the corresponding logs.
    The tool may return an SQL query or a clarifying message if the natural language question is not
    clear or requires further clarification. You may need to call the tool multiple times to obtain
    the final SQL query. Each time you call the tool, you only need to append new clarification statement to the `question` field

    Args:
        question: The natural language question to convert into a SQL query. Or any clarifying message.
        topic_id: Optional topic ID to search logs from. If not provided, uses the globally configured topic.
        session_id: Optional session ID to use for the conversation. If not provided, a new session will be created.


    """
    # 转下session类型,解决json.loads类型问题
    if session_id:
        session_id = str(session_id)

    topic_id = topic_id or global_topic_id
    if not topic_id:
        raise ValueError("topic id is required")

    instance_name = config.account_id
    if not instance_name:
        raise ValueError("account_id of your env variable should be set")

    instance_type = "ai_assistant"
    app_meta_type = "tls.app.ai_assistant.session"

    try:
        app_instance = await describe_app_instances_resource(
            instance_name, instance_type
        )
        instance_list = app_instance.get("InstanceInfo", [])
        if len(instance_list) == 0:
            create_app_instance_response = await create_app_instance_resource(
                instance_name=instance_name, instance_type=instance_type
            )
            instance_id = create_app_instance_response.get("InstanceID", "")
        else:
            instance_id = instance_list[0].get("InstanceId", "")

        if not session_id:
            # 创建ai会话
            create_app_scene_meta_response = await create_app_scene_meta_resource(
                instance_id=instance_id,
                app_meta_type=app_meta_type,
                topic_id=topic_id,
            )
            session_id = create_app_scene_meta_response.get("Id", "")

        # 读取返回的会话信息,解析sql
        answer = await describe_session_answer_resource(
            instance_id=instance_id,
            topic_id=topic_id,
            question=question,
            session_id=session_id,
        )

        return answer

    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def search_logs(
        query: str,
        topic_id: str = "",
        limit: int = 100,
        start_time: int = -1,
        end_time: int = -1,
) -> List[Dict]:
    """Search logs using the provided query from the TLS service.

    This tool allows you to search logs using various query types including full text search,
    key-value search, and SQL analysis. It provides flexible time range filtering and
    limit options to customize your search results.

    Args:
        query: Search query string. Supports three formats:
            - Full text search: e.g., "error"
            - Key-value search: e.g., "key1:error"
            - SQL analysis: e.g., "* | select count(*) as count"
        topic_id: Optional topic ID to search logs from. If not provided, uses the globally configured topic.
        limit: Maximum number of logs to return (default: 100)
        start_time: Start time in milliseconds since epoch (default: 15 minutes ago)
        end_time: End time in milliseconds since epoch (default: current time)

    Returns:
        List of log entries matching the search criteria. Each log entry is a dictionary
        containing the log data, timestamp, and other metadata.

    Examples:
        # Search for error logs
        search_logs("error")

        # Search for logs with a specific key-value
        search_logs("status_code:500")

        # Perform SQL analysis
        search_logs("* | select count(*) as count group by status_code")
    """
    logger.info(f"Received search_logs request with query: {query}")

    try:
        # Use current time if end_time is not provided
        if end_time < 0:
            end_time = int(time.time() * 1000)

        # Use 15 minutes ago if start_time is not provided
        if start_time < 0:
            start_time = end_time - (15 * 60 * 1000)  # 15 minutes in milliseconds
        topic_id = topic_id or global_topic_id
        if not topic_id:
            raise ValueError("Topic ID is required")
        logger.info(
            f"Searching logs with query: {query} for topic: {topic_id}, limit: {limit}, time range: {start_time} to {end_time}"
        )

        return tls_query_resource.search_logs(
            topic_id,
            query,
            limit,
            start_time,
            end_time,
        )

    except Exception as e:
        logger.error(f"Error in search_logs: {str(e)}")
        return {"error": str(e)}


@mcp.tool()
def get_recent_logs(
        topic_id: str = "", limit: int = 100, time_range_minutes: int = 15
) -> List[Dict]:
    """Retrieve the most recent logs from the TLS service without filtering.

    This tool provides a convenient way to fetch the most recent logs from a specified topic
    without needing to provide a specific search query. It's useful for monitoring recent
    activity or troubleshooting recent issues.

    Args:
        topic_id: Optional topic ID to retrieve logs from. If not provided, uses the globally configured topic.
        limit: Maximum number of logs to return (default: 100)
        time_range_minutes: Time range in minutes to search back from the current time (default: 15)

    Returns:
        List of the most recent log entries within the specified time range. Each log entry
        is a dictionary containing the log data, timestamp, and other metadata.
    """
    logger.info(
        f"Received get_recent_logs request with limit: {limit}, time_range: {time_range_minutes} minutes"
    )

    try:
        end_time = int(time.time() * 1000)
        start_time = end_time - (time_range_minutes * 60 * 1000)

        topic_id = topic_id or global_topic_id
        if not topic_id:
            raise ValueError("Topic ID is required")
        # Use "*" as query to match all logs
        logger.info(
            f"Searching recent logs with for topic: {topic_id}, limit: {limit}, time range: {start_time} to {end_time}"
        )
        return tls_query_resource.search_logs(
            topic_id,
            "*",
            limit,
            start_time,
            end_time,
        )
    except Exception as e:
        logger.error(f"Error in get_recent_logs: {str(e)}")
        return {"error": str(e)}


def main():
    """Main entry point for the MCP server."""
    parser = argparse.ArgumentParser(description="Run the TLS MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )

    args = parser.parse_args()

    try:
        # Load configuration from environment variables
        global tls_service
        global global_topic_id

        global_topic_id = config.topic_id
        logger.info(f"Loaded configuration for topic ID: {global_topic_id}")

        # Initialize TLS service
        tls_service = TLSService(
            config.endpoint,
            config.access_key_id,
            config.access_key_secret,
            config.region,
        )
        logger.info(f"Initialized TLS service for endpoint: {config.endpoint}")

        # Run the MCP server
        logger.info(f"Starting TLS MCP Server with {args.transport} transport")
        mcp.run(transport=args.transport)
    except Exception as e:
        logger.error(f"Error starting TLS MCP Server: {str(e)}")
        raise


if __name__ == "__main__":
    main()
