import os

from tool_server_client.client import ComputerUseClient, new_computer_use_client

from mcp_server.common.logs import LOG
from mcp_server.common.config import tool_server_config

_local_client = None


def tool_server_client(endpoint: str = None) -> ComputerUseClient:
    global _local_client

    try:
        if tool_server_config.get("local"):
            if _local_client is None:
                endpoint = os.environ.get(
                    "TOOL_SERVER_ENDPOINT") or tool_server_config.get("endpoint")
                _local_client = new_computer_use_client(endpoint)

            return _local_client
        else:
            LOG.info(f"Get client, endpoint: {endpoint}")
            return new_computer_use_client(endpoint)

    except Exception as e:
        LOG.error(f"Get client failed: {str(e)}")
        raise e
