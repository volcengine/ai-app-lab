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

import logging
import sys
from logging.handlers import RotatingFileHandler
from pythonjsonlogger import json
from .config import get_settings
from .context import get_request_id


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() 
        return True


def configure_logging():
    log_config = get_settings().log
    logger = logging.getLogger()
    rid_filter = RequestIDFilter()
    if log_config.env == "dev":
        console_formatter = logging.Formatter(
            fmt=log_config.format,
            datefmt=log_config.datefmt,
        )
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(console_formatter)
        console_handler.addFilter(rid_filter)
        logger.addHandler(console_handler)
        logger.setLevel(logging.DEBUG)
    else:
        json_formatter = json.JsonFormatter(
           log_config.format,
        )
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(json_formatter)
        file_handler = RotatingFileHandler(
            filename=log_config.filename,
            maxBytes=log_config.max_bytes,
            backupCount=log_config.backup_count,
            encoding="utf-8"
        )
        file_handler.setFormatter(json_formatter)
        console_handler.addFilter(rid_filter)
        logger.addHandler(console_handler)
        logger.addHandler(file_handler)
        logger.setLevel(logging.INFO)

