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

import os
import logging

from concurrent_log_handler import ConcurrentRotatingFileHandler
from typing import Any, TypeVar

from mcp_server.common.config import log_config

_WRITE_MODE = "a"
T = TypeVar("T")
# TODO rename logger
LOG = logging.getLogger(__name__)
LOG.propagate = False


def setup_logger(logger: logging.Logger, config: Any) -> None:
    try:
        logger.setLevel(getattr(logging, config.level.upper(), logging.INFO))
        log_dir = os.path.dirname(config.file)
        os.makedirs(log_dir, exist_ok=True)

        formatter = logging.Formatter(
            "%(asctime)s %(levelname)7s %(filename)s:%(lineno)s - %(name)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        rotate_handler = ConcurrentRotatingFileHandler(
            config.file,
            _WRITE_MODE,
            config.max_size,
            config.backup_count,
        )
        rotate_handler.setFormatter(formatter)
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        logger.addHandler(rotate_handler)

    except Exception as e:
        print(f"Log initialize failed: {e}")
        logger.addHandler(logging.StreamHandler())
        logger.setLevel(logging.DEBUG)


setup_logger(LOG, log_config)
