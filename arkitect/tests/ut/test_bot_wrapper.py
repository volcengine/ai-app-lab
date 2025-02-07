# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import asyncio
import json
import unittest
from typing import Any, AsyncIterator, Callable, Dict, Tuple, Type
from unittest.mock import MagicMock, patch

from arkitect.core.client import Client
from arkitect.core.errors import InvalidParameter
from arkitect.core.runtime import ChatAsyncRunner, Context, Request, Response
from arkitect.launcher.vefaas.wrapper import (
    APIException,
    Environment,
    MissingParameter,
    _get_parameters,
    bot_wrapper,
    parse_function_request,
    parse_function_response,
)


class TestBotWrapper(unittest.TestCase):
    @staticmethod
    def mock_client() -> Tuple[Type[Client], Any]:
        return MagicMock(spec=Client), MagicMock()

    @staticmethod
    def mock_event_context() -> Tuple[Dict[str, Any], Context]:
        event = {
            "body": json.dumps(
                {
                    "stream": False,
                    "messages": [{"role": "user", "content": "查今天的新闻"}],
                    "model": "bot-123",
                    "stream_options": {"include_usage": True},
                }
            )
        }
        context = Context(request_id="123")
        return event, context

    @staticmethod
    def mock_runner(func: Callable) -> ChatAsyncRunner:
        return ChatAsyncRunner(runnable_func=func)  # type: ignore

    @staticmethod
    def mock_request(endpoint_config: Dict[str, Any], event: Any) -> Request:
        request = Request(stream=False)
        return request

    @staticmethod
    def mock_parse_request(event: Any, request_cls: Type[Request]) -> Request:
        return Request(stream=False)

    @staticmethod
    def mock_parse_response(status_code: int, content: Any) -> Dict[str, Any]:
        return {"key": "value"}

    @staticmethod
    async def handler(request: Request) -> AsyncIterator[Response]:
        yield Response()

    def test_bot_wrapper_entry(self) -> None:
        clients = {"client": self.mock_client()}
        with (
            patch("arkitect.launcher.vefaas.wrapper.initialize") as mock_initialize,
            patch(
                "arkitect.launcher.vefaas.wrapper.get_runner",
                side_effect=self.mock_runner,
            ) as mock_get_runner,
            patch(
                "arkitect.launcher.vefaas.wrapper.get_endpoint_config"
            ) as mock_get_endpoint_config,
            patch(
                "arkitect.launcher.vefaas.wrapper.parse_request",
                side_effect=self.mock_parse_request,
            ) as mock_parse_request,
            patch(
                "arkitect.launcher.vefaas.wrapper.parse_response",
                side_effect=self.mock_parse_response,
            ) as mock_parse_response,
        ):
            wrapped_func = bot_wrapper(
                endpoint_path="/api/v3/bots/chat/completions",
                clients=clients,
                trace_on=False,
            )(self.handler)
            event, context = self.mock_event_context()
            result = asyncio.run(wrapped_func(event, context))

            mock_initialize.assert_called_once_with(context, clients, False, None)
            mock_get_runner.assert_called_once_with(self.handler)
            mock_get_endpoint_config.assert_called_once_with(
                endpoint_path="/api/v3/bots/chat/completions",
                runnable_func=self.handler,
            )
            mock_parse_request.assert_called_once_with(
                event=event,
                request_cls=mock_get_endpoint_config.return_value.get.return_value,
            )
            mock_parse_response.assert_called_once_with(status_code=200, content="{}")
            self.assertIsInstance(result, dict)
            self.assertEqual(result, {"key": "value"})

    def test_get_parameters_local(self) -> None:
        # Test case for LOCAL environment
        request_data = {"key": "value"}
        result = _get_parameters(Environment.LOCAL, request_data)
        self.assertEqual(result, (request_data, Context()))

        with self.assertRaises(MissingParameter):
            _get_parameters(
                Environment.LOCAL
            )  # Missing parameters should raise MissingParameter

    def test_get_parameters_vefaas(self) -> None:
        # Test case for VEFAAS environment
        event_data = {"body": "value"}
        context_data = Context()
        result = _get_parameters(Environment.VEFAAS, event_data, context_data)
        self.assertEqual(result, (event_data, context_data))

        with self.assertRaises(TypeError):
            _get_parameters(
                Environment.VEFAAS
            )  # Missing parameters should raise TypeError

    def test_parse_function_request_local_dict(self) -> None:
        environment = Environment.LOCAL
        parameters = {"key": "value"}
        endpoint_path = "/test"
        func = self.handler

        result = parse_function_request(environment, parameters, endpoint_path, func)
        self.assertIsInstance(result, Request)

    def test_parse_function_request_local_request_instance(self) -> None:
        environment = Environment.LOCAL
        request_instance = Request()
        endpoint_path = "/test"
        func = self.handler

        result = parse_function_request(
            environment, request_instance, endpoint_path, func
        )
        self.assertEqual(result, request_instance)

    def test_parse_function_request_vefaas(self) -> None:
        environment = Environment.VEFAAS
        parameters = {"body": json.dumps({"stream": False})}
        endpoint_path = "/test"
        func = self.handler

        result = parse_function_request(environment, parameters, endpoint_path, func)
        self.assertIsInstance(result, Request)

    def test_parse_function_response_local_response(self) -> None:
        environment = Environment.LOCAL
        response = Response()

        result = parse_function_response(environment, response=response)
        self.assertEqual(result, response)

    def test_parse_function_response_local_exception(self) -> None:
        environment = Environment.LOCAL
        exception = InvalidParameter(parameter="test")

        with self.assertRaises(APIException):
            parse_function_response(environment, exception=exception)

    def test_parse_function_response_vefaas_response(self) -> None:
        environment = Environment.VEFAAS
        response = Response()

        result = parse_function_response(environment, response=response)
        self.assertIsInstance(result, dict)
        self.assertIn("statusCode", result)
        self.assertIn("body", result)

    def test_parse_function_response_vefaas_exception(self) -> None:
        environment = Environment.VEFAAS
        exception = InvalidParameter(parameter="test")

        result = parse_function_response(environment, exception=exception)
        self.assertIsInstance(result, dict)
        self.assertIn("statusCode", result)
        self.assertIn("body", result)


if __name__ == "__main__":
    unittest.main()
