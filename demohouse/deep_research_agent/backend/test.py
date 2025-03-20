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

from arkitect.core.component.tool.builder import build_mcp_clients_from_config
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.types.llm.model import ArkMessage


async def main():
    clients = build_mcp_clients_from_config(
        "/Users/bytedance/Documents/deepresearch/ai-app-lab/demohouse/deep_research_agent/backend/mcp_config.json"
    )

    for client in clients.values():
        await client.connect_to_server()

    for client in clients.values():
        print(await client.list_tools())

    llm = BaseChatLanguageModel(
        messages=[
            ArkMessage(
                role="user",
                content="https://raw.githubusercontent.com/modelcontextprotocol/servers/refs/heads/main/src/everart/Dockerfile 这里有什么",
            )
        ],
        model="doubao-1.5-pro-32k-250115",
    )
    resp = await llm.arun(functions=list(clients.values()))
    print(resp)


if __name__ == "__main__":
    import asyncio

    asyncio.get_event_loop().run_until_complete(main())
