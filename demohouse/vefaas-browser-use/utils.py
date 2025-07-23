import os
import logging
from typing import Any, Dict, List
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult


root_logger = logging.getLogger()
for handler in root_logger.handlers:
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        '%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)


def enforce_log_format():
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s',
            '%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)


def check_llm_config() -> str:
    llm_name = ""
    llm_openai = "openai"
    llm_deepseek = "deepseek"
    llm_ark = "ark"

    if os.getenv("OPENAI_API_KEY"):
        llm_name = llm_openai
    elif os.getenv("DEEPSEEK_API_KEY"):
        llm_name = llm_deepseek
    elif os.getenv("ARK_API_KEY"):
        if os.getenv("ARK_MODEL_ID") == "":
            raise Exception(
                "ARK_MODEL_ID is not set, please set ARK_MODEL_ID in environment variables")
        llm_name = llm_ark
    else:
        raise Exception(
            "No LLM API key found, please set OPENAI_API_KEY, DEEPSEEK_API_KEY or ARK_API_KEY/ARK_MODEL_ID in environment variables")

    print("using llm: ", llm_name)
    return llm_name


class ModelLoggingCallback(BaseCallbackHandler):
    def on_chat_model_start(
        self, serialized: Dict[str, Any], messages: List[List[BaseMessage]], **kwargs
    ) -> None:
        logging.info(
            f"[Model] Chat model started\n")

    def on_llm_end(self, response: LLMResult, **kwargs) -> None:
        logging.info(
            f"[Model] Chat model ended, response: {response}")

    def on_llm_error(self, error: BaseException, **kwargs) -> Any:
        logging.info(
            f"[Model] Chat model error, response: {error}")

    def on_chain_start(
        self, serialized: Dict[str, Any], inputs: Dict[str, Any], **kwargs
    ) -> None:
        logging.info(
            f"[Model] Chain {serialized.get('name')} started")

    def on_chain_end(self, outputs: Dict[str, Any], **kwargs) -> None:
        logging.info(f"[Model] Chain ended, outputs: {outputs}")

# class that wraps another class and logs all function calls being executed


class Wrapper:
    def __init__(self, wrapped_class):
        self.wrapped_class = wrapped_class

    def __getattr__(self, attr):
        original_func = getattr(self.wrapped_class, attr)

        def wrapper(*args, **kwargs):
            print(f"Calling function: {attr}")
            print(f"Arguments: {args}, {kwargs}")
            result = original_func(*args, **kwargs)
            print(f"Response: {result}")
            return result

        return wrapper
