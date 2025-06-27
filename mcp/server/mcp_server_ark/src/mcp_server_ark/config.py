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

import os
import logging
from dataclasses import dataclass
from typing import Dict

logger = logging.getLogger(__name__)


@dataclass
class ArkConfig:
    """Configuration for Ark MCP Server."""

    ark_api_key: str
    tools: Dict[str, bool]  # Mapping of default tool name to configured tool name
    ark_bot_id: str
    ark_bot_name: str
    ark_bot_description: str


def _get_bool_env_var(var_name: str, default: bool = False) -> bool:
    """Get a boolean environment variable with a default value."""
    value = os.getenv(var_name, str(default)).lower()
    return value in ("true", "1", "t")


def load_config() -> ArkConfig:
    """Load configuration from environment variables."""
    required_vars = ["ARK_API_KEY"]

    # Check if all required environment variables are set
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    if missing_vars:
        error_msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    # Get tool name configurations with defaults
    tools = {
        "link_reader": _get_bool_env_var("ARK_TOOL_LINK_READER"),
        "caculator": _get_bool_env_var("ARK_TOOL_CACULATOR"),
    }
    config = ArkConfig(
        ark_api_key=os.environ["ARK_API_KEY"],
        ark_bot_id=os.getenv("ARK_BOT_ID", ""),
        ark_bot_description=os.getenv("ARK_BOT_DESCRIPTION", ""),
        ark_bot_name=os.getenv("ARK_BOT_NAME", ""),
        tools=tools,
    )

    if config.ark_bot_id:
        if not config.ark_bot_description:
            error_msg = f"Missing required environment variable when set ARK_BOT_ID: ARK_BOT_DESCRIPTION"
            logger.error(error_msg)
            raise ValueError(error_msg)
        if not config.ark_bot_name:
            error_msg = f"Missing required environment variable when set ARK_BOT_ID: ARK_BOT_NAME"
            logger.error(error_msg)
            raise ValueError(error_msg)

    return config
