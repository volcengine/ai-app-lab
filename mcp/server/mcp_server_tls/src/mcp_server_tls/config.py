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

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TLSConfig:
    """Configuration for TLS MCP Server."""

    endpoint: str
    region: str
    access_key_id: str
    access_key_secret: str
    topic_id: str
    account_id: str


def load_config() -> TLSConfig:
    """Load configuration from environment variables."""
    required_vars = [
        "VOLC_ACCESSKEY",
        "VOLC_SECRETKEY",
        "ACCOUNT_ID",
    ]

    # Check if all required environment variables are set
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    if missing_vars:
        error_msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    # Load configuration from environment variables
    return TLSConfig(
        endpoint=os.getenv("VOLCENGINE_ENDPOINT", "https://tls-cn-beijing.volces.com"),
        region=os.getenv("REGION", "cn-beijing"),
        access_key_id=os.environ["VOLC_ACCESSKEY"],
        access_key_secret=os.environ["VOLC_SECRETKEY"],
        topic_id=os.getenv("TLS_TOPIC_ID", ""),
        account_id=os.getenv("ACCOUNT_ID", ""),
    )


config = load_config()
