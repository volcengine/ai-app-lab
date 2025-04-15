# -*- coding: utf-8 -*-
# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at 
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Client for managing sandbox environments.
Provides functionality to create, manage and interact with sandbox instances.
"""

import logging
import requests
from abc import ABC, abstractmethod
from typing import Dict, List

from common.config import get_settings


class SandboxManager(ABC):
    """
    Abstract base class for sandbox management service, you can define your own SandboxManager class.
    for example: get mcp server endpoint from config file.
    """
    @abstractmethod
    def get_tool_server_endpoint(self, sandbox_id:str=None) -> str|None:
        pass


class ECSSandboxManager(SandboxManager):
    """
    ECS sandbox manager implementation
    Manages ComputerUse sandbox environments deployed on ECS (Elastic Compute Service) instances, handling mcp server endpoint management.
    """
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(ECSSandboxManager, cls).__new__(cls)
            cls._instance.__init__()
        return cls._instance

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.endpoint = get_settings().sandbox.manager_endpoint
        self.timeout = get_settings().sandbox.manager_req_timeout
        self.tool_server_endpoint_format = get_settings().sandbox.tool_server_endpoint_format

    def _describe_sandboxes(self, sandbox_id: str) -> List[Dict[str, str]]:
        """
        Retrieve sandbox metadata from remote sandbox manager service

        Args: 
            sandbox_id: Unique identifier for the sandbox environment
        Returns: 
            List of sandbox metadata dictionaries
        """
        params = {"Action": "DescribeSandboxes", "Version": "2020-04-01", "SandboxId": sandbox_id}
        response = requests.get(self.endpoint, params=params, timeout=self.timeout, headers={"Authorization": get_settings().planner.auth_api_key})
        sandboxes = response.json().get("Result", [])
        if len(sandboxes) == 0:
            raise ValueError("Sandbox not found")
        return sandboxes

    def get_tool_server_endpoint(self, sandbox_id: str=None) -> str | None:
        """
        Get MCP server endpoint URL for specified sandbox

        Args:
            sandbox_id: Target sandbox environment identifier
        Returns:
            Formatted MCP server URL
        """

        sandboxes = self._describe_sandboxes(sandbox_id)
        ip = next(s.get("PrimaryIp") for s in sandboxes if isinstance(s, dict) and s.get("SandboxId") == sandbox_id)
        if not ip:
            raise ValueError("Sandbox not found")
        return self.tool_server_endpoint_format.format(sandbox_primary_ip=ip)
