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

import asyncio
import json
import os
import sys
from asyncio.log import logger
from contextlib import AsyncExitStack
from typing import Callable

import anyio
from anyio.abc import Process

from arkitect.core.component.tool.mcp_client import MCPClient
from mcp.client.stdio import get_default_environment


def build_mcp_clients_from_config(  # type: ignore
    config_file: str,
    **kwargs,
) -> tuple[dict[str, MCPClient], Callable]:
    # https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers#servername
    # check file exist
    if not os.path.exists(config_file):
        raise ValueError(f"Config file {config_file} does not exist")

    with open(config_file, "r") as f:
        config = json.loads(f.read())
    mcp_servers_config = config.get("mcpServers", {})
    mcp_clients = {}
    exit_stack = AsyncExitStack()
    for server_name in mcp_servers_config:
        command = mcp_servers_config[server_name].get("command", None)
        args = mcp_servers_config[server_name].get("args", None)
        env = mcp_servers_config[server_name].get("env", None)
        server_url = mcp_servers_config[server_name].get("url", None)
        port = mcp_servers_config[server_name].get("port", None)
        if port is not None:
            logger.info("Starting local SSE MCP server")
            client = MCPClient(
                name=server_name,
                server_url=f"http://localhost:{port}/sse",
                exit_stack=exit_stack,
                **kwargs,
            )
        else:
            logger.info("Starting server")
            client = MCPClient(
                name=server_name,
                server_url=server_url,
                command=command,
                arguments=args,
                env=env,
                **kwargs,
            )
        mcp_clients[server_name] = client

    async def cleanup() -> None:
        try:
            await exit_stack.aclose()
        except asyncio.CancelledError as e:
            logger.error("Error while closing exit stack: %s", e)
        except BaseException as e:
            logger.error("Error while closing exit stack: %s", e)

    return mcp_clients, cleanup


async def spawn_mcp_server_from_config(
    config_file: str,
) -> list[Process]:
    # https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers#servername
    # check file exist
    if not os.path.exists(config_file):
        raise ValueError(f"Config file {config_file} does not exist")

    with open(config_file, "r") as f:
        config = json.loads(f.read())
    mcp_servers_config = config.get("mcpServers", {})
    processes = []
    for server_name in mcp_servers_config:
        command = mcp_servers_config[server_name].get("command", None)
        args = mcp_servers_config[server_name].get("args", None)
        env = mcp_servers_config[server_name].get("env", None)
        port = mcp_servers_config[server_name].get("port", None)
        if port is not None:
            logger.info("Starting local SSE MCP server")
            env["PORT"] = str(port)
            envs = get_default_environment()
            if env is not None:
                envs.update(env)
            p = await anyio.open_process(
                [command, *args, "--transport", "sse"],
                env=envs,
                stderr=sys.stderr,
            )
            processes.append(p)
        else:
            logger.info("No need to start server")

    return processes
