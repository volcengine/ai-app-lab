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
Logging management for the Planner service.
Provides centralized logging configuration and formatting.
"""

import logging
import re
import sys

from logging.handlers import RotatingFileHandler
from pythonjsonlogger import json

from common.config import get_settings


class PlannerLogFormatter(logging.Formatter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.image_regex = re.compile(r"data:image/(png|jpg|gif);base64,[A-Za-z0-9+/=]+")
        self.base64_text_regex = re.compile(r"(text=|'text':\s+)'[A-Za-z0-9+/=]{5,}'")

    def format(self, record):
        s = super().format(record)
        s = self.image_regex.sub("data:image/any;base64,REPLACED", s)
        s = self.base64_text_regex.sub("'text': 'REPLACED'", s)
        return s


class LoggerManager:
    _initialized = False
    _logger_instances = {}

    @classmethod
    def get_logger(cls, name="agent_planner"):
        if name not in cls._logger_instances:
            cls._logger_instances[name] = logging.getLogger(name)
        return cls._logger_instances[name]

    @classmethod
    def initialize(cls):
        if cls._initialized:
            return False

        log_config = get_settings().log
        root_logger = logging.getLogger()
        if log_config.env == "dev":
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setFormatter(PlannerLogFormatter(get_settings().log.fmt))
            root_logger.addHandler(console_handler)
            root_logger.setLevel(logging.DEBUG)
        else:
            json_formatter = json.JsonFormatter(PlannerLogFormatter(get_settings().log.fmt))
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(json_formatter)
            file_handler = RotatingFileHandler(filename=log_config.filename, maxBytes=log_config.max_bytes,
                                               backupCount=log_config.backup_count, encoding="utf-8")
            file_handler.setFormatter(json_formatter)
            root_logger.addHandler(console_handler)
            root_logger.addHandler(file_handler)
            root_logger.setLevel(logging.INFO)

        cls._initialized = True
        return True


__all__ = ['LoggerManager']
logger = LoggerManager.get_logger()