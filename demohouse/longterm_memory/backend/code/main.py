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
import os
import time

from typing import Union, AsyncIterable

from mem0 import Memory
from config import mem0_config, CHAT_ENDPOINT
from prompt import CHAT_PROMPT, SYSTEM_PROMPT

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model  import (
    ArkChatRequest,
    ArkChatResponse,
    ArkChatParameters,
    ArkMessage,
    ArkChatCompletionChunk,
    Response,
)
from arkitect.core.errors import Error
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.utils.context import get_reqid

logger = logging.getLogger(__name__)

memory_client = Memory.from_config(mem0_config)

def assemble_resp(status_code, message, error_flag=False, error_msg="", metadata=None):
    error = None
    if error_flag:
        error = Error(code=error_msg, code_n=status_code, message=message)

    return ArkChatResponse(
        error=error,
        id=get_reqid(),
        choices=[],
        model="",
        created=int(time.time()),
        object="chat.completion",
        metadata=metadata,
    )

@task()
async def store_memory(
    request: ArkChatRequest,
)-> AsyncIterable[ArkChatResponse]: 
    user_id = request.metadata.get("user_id")
    agent_id = request.metadata.get("agent_id")
    messages = request.messages

    subscriptable_messages = [
        {
            "role": message.role,
            "content": message.content,
        }
        for message in messages
    ]
    
    async for resp in memory_client.add_by_ark(messages=subscriptable_messages, user_id=user_id, agent_id=agent_id):
        yield resp

@task()
async def chat_completions(request: ArkChatRequest) -> AsyncIterable[ArkChatResponse]:
    query = request.messages[-1].content
    user_id = request.metadata.get("user_id")
    agent_id = request.metadata.get("agent_id")
    assert user_id is not None and agent_id is not None
    
    retrieve_count = request.metadata.get("retrieve_count", 1)
    retrieve_chunks = memory_client.search(query=query, user_id=user_id, agent_id=agent_id, limit=retrieve_count)
    session_memory = [chunk.get("memory", "") for chunk in retrieve_chunks]
    
    yield assemble_resp(200, "fetch memory success", metadata={
        "returned_memories": session_memory
    })
    
    final_messages = [ArkMessage(role="system", content=SYSTEM_PROMPT.render(session_memory=session_memory))]
    final_messages.extend(request.messages[:-1])
    query = request.messages[-1].content
    # last_message = CHAT_PROMPT.render( user_input=query)
    last_message = query
    final_messages.append(ArkMessage(role="user", content=last_message))
    
    llm_chat = BaseChatLanguageModel(
        endpoint_id=CHAT_ENDPOINT,
        messages=final_messages,
        parameters=ArkChatParameters(temperature=0.001, top_p=0.001, stream_options=request.stream_options),
    )
    
    if request.stream:
        iterator = llm_chat.astream()
        async for resp in iterator:
            yield resp
    else:
        yield await llm_chat.arun()

@task()
async def list_memory(
    request: ArkChatRequest,
):
    user_id = request.metadata.get("user_id")
    agent_id = request.metadata.get("agent_id")
    assert user_id is not None and agent_id is not None
    returned_memories = memory_client.get_all(user_id=user_id, agent_id=agent_id, limit=5000)
    yield assemble_resp(200, "success", metadata={'returned_memories': returned_memories})

@task()
async def add_memory(
    request: ArkChatRequest,
):
    user_id = request.metadata.get("user_id")
    agent_id = request.metadata.get("agent_id")
    assert user_id is not None and agent_id is not None
    
    metadata = {
        'user_id': user_id,
        'agent_id': agent_id,
    }
    
    memory_ids = []
    memory = request.metadata.get("memory", [])
    for message in memory:
        memory_id = memory_client._create_memory(data=message, existing_embeddings={}, metadata=metadata)
        memory_ids.append(memory_id)
    
    yield assemble_resp(200, "add memory success", metadata={'memory_ids': memory_ids})
     
TYPE_MAP_FUNC = {
    "store_memory": store_memory,
    "chat_completions": chat_completions,
    "list_memory": list_memory,
    'add_memory': add_memory,
}

@task()
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:  
      
    type = request.metadata.get("type")
    assert type is not None
    
    func = TYPE_MAP_FUNC.get(type)
    assert func is not None
    
    async for resp in func(request):
        yield resp
     
@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    async for resp in default_model_calling(request):
        yield resp

if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="main",
        port=int(port) if port else 8888,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        clients={},
    )
