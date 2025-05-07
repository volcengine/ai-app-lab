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

