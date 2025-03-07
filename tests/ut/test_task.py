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
import io
import json
import logging
import unittest
from os import linesep
from typing import IO, List, Optional

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

from arkitect.telemetry.trace.wrapper import _update_kwargs, task


@task()
def test_sync(num: Optional[int] = None) -> int:
    if num is None:
        num = 0
    if num >= 2:
        return num
    return test_sync(num + 1)


@task()
async def test_async(num: Optional[int] = None) -> int:
    if num is None:
        num = 0
    if num >= 2:
        return num
    return await test_async(num + 1)


def setup_tracing(buffer: IO) -> None:
    trace.set_tracer_provider(TracerProvider())
    exporter = ConsoleSpanExporter(
        service_name="test_task",
        out=buffer,
        formatter=lambda span: span.to_json(indent=None) + linesep,
    )
    trace.get_tracer_provider().add_span_processor(SimpleSpanProcessor(exporter))


class TestTask(unittest.TestCase):
    def setUp(self):
        self.f = io.StringIO()
        setup_tracing(self.f)

    def test_update_kwargs(self):
        def func(request, config, extra=None):
            pass

        args = ["1", "2"]
        kwargs = {"a": "3", "b": "4"}
        input = _update_kwargs(args, kwargs, func)
        self.assertEqual(input.get("request"), "1")
        self.assertEqual(input.get("config"), "2")
        self.assertEqual(input.get("a"), "3")
        self.assertEqual(input.get("b"), "4")
        self.assertEqual(kwargs.get("request"), None)
        self.assertEqual(kwargs.get("config"), None)

        args = ["1", "2"]
        kwargs = None
        input = _update_kwargs(args, kwargs, func)
        self.assertEqual(input.get("request"), "1")
        self.assertEqual(input.get("config"), "2")

        args = None
        kwargs = {"a": "3", "b": "4"}
        input = _update_kwargs(args, kwargs, func)
        self.assertEqual(input.get("a"), "3")
        self.assertEqual(input.get("b"), "4")

        args = None
        kwargs = None
        input = _update_kwargs(args, kwargs, func)
        self.assertEqual(input, {})

    def test_sync_nested(self):
        test_sync()
        spans = []
        for line in self.f.getvalue().splitlines():
            span = json.loads(line)
            spans.append(span)
        self.assertEqual(len(spans), 3)
        self.assertEqual(spans[2]["parent_id"], None)
        self.assertEqual(spans[1]["parent_id"], spans[2]["context"]["span_id"])
        self.assertEqual(spans[0]["parent_id"], spans[1]["context"]["span_id"])

    def test_async_nested(self):
        loop = asyncio.get_event_loop()
        loop.run_until_complete(test_async())
        spans = []
        for line in self.f.getvalue().splitlines():
            span = json.loads(line)
            spans.append(span)
        self.assertEqual(len(spans), 3)
        self.assertEqual(spans[2]["parent_id"], None)
        self.assertEqual(spans[1]["parent_id"], spans[2]["context"]["span_id"])
        self.assertEqual(spans[0]["parent_id"], spans[1]["context"]["span_id"])

    def test_async_sync_mixed(self):
        loop = asyncio.get_event_loop()
        loop.run_until_complete(test_async(test_sync()))
        spans = []
        for line in self.f.getvalue().splitlines():
            span = json.loads(line)
            spans.append(span)
        self.assertEqual(len(spans), 4)
        self.assertEqual(spans[3]["parent_id"], None)
        self.assertEqual(spans[2]["parent_id"], None)
        self.assertEqual(spans[1]["parent_id"], spans[2]["context"]["span_id"])
        self.assertEqual(spans[0]["parent_id"], spans[1]["context"]["span_id"])

    def test_simulated(self):
        @task()
        async def chat() -> List[str]:
            return ["hello", "world"]

        @task()
        async def main(_messages: List[str]) -> List[str]:
            return await chat()

        @task()
        async def assistant_chat():
            await main(["Who are you"])

        loop = asyncio.get_event_loop()
        loop.run_until_complete(assistant_chat())
        spans = []
        for line in self.f.getvalue().splitlines():
            span = json.loads(line)
            spans.append(span)
        self.assertEqual(len(spans), 3)
        self.assertEqual(spans[2]["parent_id"], None)
        self.assertEqual(spans[1]["parent_id"], spans[2]["context"]["span_id"])
        self.assertEqual(spans[0]["parent_id"], spans[1]["context"]["span_id"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    unittest.main()
