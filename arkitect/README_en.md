# Arkitect SDK
[简体中文](./README.md) 

## Overview

### Introduction

**Arkitect** **SDK** empowers enterprise developers with the tools and workflows needed to build and scale large-model applications. With Arkitect SDK and code examples, you can quickly create solutions tailored to your business needs.

### Advantages

- **Flexible Customization:** Leverage high-code agent orchestration to meet complex and highly personalized business needs.
- **Comprehensive Business Tools:** Access a robust library of plugins and toolchains, seamlessly integrating with advanced models to build end-to-end intelligent applications.
- **One-Stop Development & Management:** Simplify deployment and management processes, boosting system stability and scalability.
- **Secure & Reliable:** Built-in security practices protect business data, minimizing risks of leaks or breaches.
- **Quickstart Code Samples:** Get started quickly with extendable prototypes, easily customizable to fit your specific requirements.

### Scenarios

**Arkitect** **SDK** powers customized intelligent applications, enabling large-model adoption and business transformation across industries.

- **Intelligent Cockpit:** Intelligent in-car interactions with chat, online queries, and feature activation.
- **Financial Services:** Intelligent investment advisory, risk assessment, and customer service automation.
- **E-commerce Management:** Real-time inventory tracking and demand forecasting.
- **Office Assistant****:** Support enterprise users with document creation, meeting management, and data analysis to boost workplace productivity.
- **Industry Solutions:** Tailored large-model applications for sectors like automotive, finance, and public services.

## Supported Features

| Feature                             | Description                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Prompt Rendering & Model Invocation | Simplifies the process of prompt rendering and handling model invocation results.                |
| Plugin Management                   | Supports local plugin registration, plugin management, and integration with FC model automation. |
| Trace Monitoring                    | Supports trace management and reporting through integration with the OTEL protocol.              |

## Application List

| Application                                                                                     | Description                                                                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Interactive Bilingual Video Generator](https://chatgpt.com/c/demohouse/chat2cartoon/README.md) | Generates engaging bilingual videos with a simple theme.                            |
| [Real-Time Video Understanding](https://chatgpt.com/c/demohouse/video_analyser/README.md)       | Enables real-time visual and speech udnerstanding based on the Doubao-Vision models |
| [Live Voice Call - QingQing](https://chatgpt.com/c/demohouse/live_voice_call/README.md)         | Supports real-time voice calls with AI friend - Qiao Qingqing.                      |

## Quickstart

### Basic Chat

1. **Install Arkitect:**

  ```Bash
  pip install arkitect --index-url https://pypi.org/simple
  ```

2. **Create an Inference** **Endpoint**: Log in to the [Ark Console](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint?projectName=default) and create an endpoint. 
3. **Generate an API Key:** Follow the [API Key guide](https://www.volcengine.com/docs/82379/1399008#_1-获取并配置-api-key). 
4. **Create** **`main.py`**: Replace `endpoint_id` with your newly created endpoint ID.

```Python
import os
from typing import AsyncIterable, Union

from arkitect.core.component.context.context import Context

from arkitect.types.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    Response,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task


@task()
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    parameters = ArkChatParameters(**request.__dict__)
    ctx = Context(model="doubao-1.5-pro-32k-250115", parameters=parameters)
    await ctx.init()
    messages = [
        {"role": message.role, "content": message.content}
        for message in request.messages
    ]
    resp = await ctx.completions.create(messages=messages, stream=request.stream)
    if request.stream:
        async for chunk in resp:
            yield chunk
    else:
        yield resp


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    async for resp in default_model_calling(request):
        yield resp

if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="main",
        port=int(port) if port else 8080,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        clients={},
    )

```

5. **Set API Key and Start Server:**

```Bash
export ARK_API_KEY=<YOUR APIKEY>
python3 main.py
```

6. **Send a Request:**

```Shell
curl --location 'http://localhost:8080/api/v3/bots/chat/completions' \
--header 'Content-Type: application/json' \
--data '{
    "model": "my-bot",
    "messages": [{"role": "user", "content": "Introduce yourself"}]
}'
```

### Plugin Invocation

1. **Install Arkitect:**

```Bash
pip install arkitect --index-url https://pypi.org/simple
```

2. **Create an Inference** **Endpoint**: Log in to the [Ark Console](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint?projectName=default) and create an endpoint OR using a function-call model (e.g., Doubao-pro-32k-functioncall-241028). (For BytePlus users, please refer to [ModelArk Console](https://console.byteplus.com/ark/region:ark-stg+ap-southeast-1/endpoint?projectName=default) to create an endpoint.)
3. **Generate an API Key:** Follow the [API Key guide](https://www.volcengine.com/docs/82379/1399008#_1-获取并配置-api-key). (For BytePlus users, please refer to the  [Obtaining API Key](https://docs.byteplus.com/en/docs/ModelArk/1399008#_1-obtaining-and-configuring-api-key))
4. **Create** **`main.py`**: Replace `endpoint_id` with your newly created endpoint ID.

```Python
"""
fc+llm
"""

import os
from typing import AsyncIterable, Union

from arkitect.core.component.context.context import Context

from arkitect.core.component.context.model import ToolChunk
from arkitect.types.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    Response,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task


# you can define your own methods here and let LLM use as tools
def adder(a: int, b: int) -> int:
    """Add two integer numbers

    Args:
        a (int): first number
        b (int): second number

    Returns:
        int: sum result
    """
    print("calling adder")
    return a + b


@task()
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    parameters = ArkChatParameters(**request.__dict__)
    ctx = Context(
        model="deepseek-v3-241226",
        tools=[adder],
        parameters=parameters,
    )
    await ctx.init()
    messages = [
        {"role": message.role, "content": message.content}
        for message in request.messages
    ]
    resp = await ctx.completions.create(messages=messages, stream=request.stream)
    if request.stream:
        async for chunk in resp:
            if isinstance(chunk, ToolChunk):
                continue
            yield chunk
    else:
        yield resp


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    async for resp in default_model_calling(request):
        yield resp


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="main",
        port=int(port) if port else 8080,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        clients={},
    )

```

5. **Set API Key and Start Server:**

```Bash
export ARK_API_KEY=<YOUR APIKEY>
python3 main.py
```

6. **Send a Request:**

```Shell
curl --location 'http://localhost:8080/api/v3/bots/chat/completions' \
--header 'Content-Type: application/json' \
--data '{
    "model": "my-bot",
    "messages": [
        {
            "role": "user",
            "content": "The old king wants to raise horses, and he has such a pool of water: if he raises 30 horses, he can drink all the water in 8 days; if he raises 25 horses, he can drink all the water in 12 days. The king wants to raise 23 horses, so how many days later will he have to find water for them?"
        }
    ]
}'
```

The expected return is as follows:

```Python
{
    "error": null,
    "id": "0xxxxxxxxx",
    "choices": [
        {
            "finish_reason": "stop",
            "moderation_hit_type": null,
            "index": 0,
            "logprobs": null,
            "message": {
                "content": "\nFirstly, we calculate the amount of new water added per day, then we calculate the original amount of water in the pool, and finally we calculate the number of days the water can be drunk based on the number of horses kept by calling the `Calculator/Calculator` tool to do the calculation. \n\nAssuming that each horse drinks \n\(1\\n\) portions of water per day, let's start by figuring out the amount of water that has been added to the pool each day. 

Then the total amount of water for 12 days is $300-240 = 60 copies more than the total amount of water for 8 days. These 60 copies of water are the amount of water newly added in the 12-8 = 4 days, so the amount of water newly added each day is $60\\div4 = 15 copies. Then the original amount of water in the pool is $30\\\times8-15\\times8=120\parts. If 23 horses are kept, the actual daily consumption of water from the original pool will be $23-15=8$ portions, so it will take $120\\\div8=15$ days\n15 days for him to find water for the horses to drink after drinking all the water in the pool.",
                "role": "assistant",
                "function_call": null,
                "tool_calls": null,
                "audio": null
            }
        }
    ],
    "created": 1737022804,
    "model": "******",
    "object": "chat.completion",
    "usage": {
        "completion_tokens": 558,
        "prompt_tokens": 1361,
        "total_tokens": 1919,
        "prompt_tokens_details": {
            "cached_tokens": 0
        }
    },
    "metadata": null
}
```

## FAQ

### **Difference** **Between Arkitect and Volcengine-SDK-Arkruntime?**

- **Arkitect**: A high-code SDK for building complex agent applications with advanced tools and workflows.
- **VolcEngine-SDK-ArkRuntime**: A simplified wrapper for Ark API management and model service access.

## License

- Code in the `./arkitect` directory follows the [Apache 2.0](https://chatgpt.com/c/APACHE_LICENSE) license.
- Code in the `./demohouse` directory follows the [VolcEngine Prototype License](https://chatgpt.com/c/ARK_LICENSE.md).