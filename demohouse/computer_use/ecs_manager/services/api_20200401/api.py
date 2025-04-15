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
from fastapi import HTTPException
from common.utils import camel_to_snake, snake_to_camel
from .manager_ecs import ECSManagerFactory
from .manager import get_manager

logger = logging.getLogger(__name__)
mgr = get_manager(ECSManagerFactory)


async def handle_20200401(action: str, params: dict):
    try:
        snake_action = camel_to_snake(action)
        return action_route(mgr, snake_action, params)
    except Exception as e:
        raise e


def action_route(obj, method, params):
    if not hasattr(obj, method):
        return HTTPException(status_code=404, detail="Action not found")
    request = generate_request(method, params)
    try:
        return getattr(obj, method)(request)
    except Exception as e:
        raise e


def generate_request(action: str, all_params: dict):
    model_cls = mgr.get_manager_request_name(action)
    logger.info(f"{action} {all_params}")
    params = {k: v for k, v in all_params.items()}
    if model_cls:
        return model_cls(**params)
    raise Exception(f"request {snake_to_camel(action)}Request not found")

