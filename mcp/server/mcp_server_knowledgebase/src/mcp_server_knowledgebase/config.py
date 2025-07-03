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

logger = logging.getLogger(__name__)


@dataclass
class KnowledgeBaseConfig:
    """Configuration for Viking Knowledge Base MCP Server."""

    host: str
    ak: str
    sk: str
    collection_name: str


def load_config() -> KnowledgeBaseConfig:
    """Load configuration from environment variables."""
    required_vars = [
        "VOLC_ACCESSKEY",
        "VOLC_SECRETKEY",
    ]

    # Check if all required environment variables are set
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    if missing_vars:
        error_msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    # Load configuration from environment variables
    return KnowledgeBaseConfig(
        ak=os.environ["VOLC_ACCESSKEY"],
        sk=os.environ["VOLC_SECRETKEY"],
        host=os.getenv("VIKING_KB_HOST", "api-knowledgebase.mlp.cn-beijing.volces.com"),
        collection_name=os.getenv("VIKING_KB_COLLECTION_NAME"),
    )


config = load_config()
