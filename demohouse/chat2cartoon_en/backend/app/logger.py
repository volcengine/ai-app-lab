from arkitect.telemetry import logger
from arkitect.utils.context import get_reqid


def _attach_info():
    info = {
        "req_id": get_reqid(),
    }

    text = ""
    for k, v in info.items():
        text += f"{k}={v} "
    return text


def INFO(message: str, *args, **kwargs):
    message = f"{_attach_info()}{message}"
    logger.INFO(message, *args, **kwargs)


def DEBUG(message: str, *args, **kwargs):
    message = f"{_attach_info()}{message}"
    logger.DEBUG(message, *args, **kwargs)


def WARN(message: str, *args, **kwargs):
    message = f"{_attach_info()}{message}"
    logger.WARN(message, *args, **kwargs)


def ERROR(message: str, *args, **kwargs):
    message = f"{_attach_info()}{message}"
    logger.ERROR(message, *args, **kwargs)
