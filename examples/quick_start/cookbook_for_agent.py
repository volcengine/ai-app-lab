from typing import Any, Optional

from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import (
    PostLLMCallHook,
    PostToolCallHook,
    PreLLMCallHook,
    PreToolCallHook,
)
from arkitect.core.component.context.model import ContextInterruption, State
from arkitect.types.llm.model import ArkChatParameters, ArkMessage

# --- 工具注册与 ChatCompletionTool ---
"""
ChatCompletionTool/FunctionDefinition 类定义
from arkitect.types.llm.model import ChatCompletionTool, FunctionDefinition

class FunctionDefinition(BaseModel):
    name: str
    description: str # From function docstring
    parameters: dict  # From function signature, converted to JSON Schema

class ChatCompletionTool(BaseModel):
    type: Literal["function"] = "function"
    function: FunctionDefinition

# 用法：在Context里使用tool参数自动注册工具,
# 不能直接用ChatCompletionTool.from_function("function")
"""


def add(a: int, b: int) -> int:
    """加法工具：返回a+b"""
    return a + b


# Q&A
# Q: 必须用from_function吗？可以手写FunctionDefinition吗？
# A: 推荐用from_function，手写容易出错。

# --- 参数注册与 ArkChatParameters（含thinking） ---
"""
ArkChatParameters 类定义
from arkitect.types.llm.model import ArkChatParameters

class ArkChatParameters(BaseModel):
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    tools: Optional[List[ChatCompletionTool]] = None
    thinking: Optional[dict] = None  # 仅部分模型支持
    # 其它参数见官方文档

# thinking参数示例（仅doubao模型支持）
"""

params = ArkChatParameters(
    temperature=0.2,
    max_tokens=100,
    thinking={"type": "enabled"},  # or "disabled"/"auto"
)

# Q&A
# Q: thinking参数所有模型都支持吗？
# A: 否，仅部分模型支持，详见模型文档。

# --- Context 注册与 Context 类 ---
"""
Context 类定义
from arkitect.core.component.context.context import Context

class Context:
    def __init__(
        self,
        *,
        model: str,
        tools: Optional[List[Callable]] = None,
        parameters: Optional[ArkChatParameters] = None,
    ): ...
    async def init(self): ...
    async def completions_create(self, messages, stream=False): ...
    @property
    def state(self): ...

# 只能在初始化时传入tools/parameters
"""
context = Context(
    model="doubao-seed-1-6-flash-250615",
    tools=[add],  # 在这里注册工具
    parameters=params,
)


async def init_context_main() -> None:
    await context.init()


# Q&A
# Q: 可以在其它地方注册参数或工具吗？
# A: 不可以，必须在Context初始化时传入。

# --- ArkMessage 与三种 role ---
"""
ArkMessage 类定义
from arkitect.types.llm.model import ArkMessage

class ArkMessage(BaseModel):
    role: Literal["user", "system", "assistant", "tool"]
    content: Union[str, dict, list, None]
    tool_calls: Optional[List[dict]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None
    reasoning_content: Optional[str] = None

# 四种role
# user: 用户输入
# system: 系统提示
# assistant: 模型输出
# tool: 工具调用
"""

msg_user = ArkMessage(role="user", content="1+2等于多少？")
msg_system = ArkMessage(role="system", content="你是一个数学助手")
msg_assistant = ArkMessage(role="assistant", content="1+2等于3")

# Q&A
# Q: role可以自定义吗？
# A: 框架目前支持user/system/assistant/tool等预定义角色，
# 自定义role需要更改框架代码。

# --- 上下文管理与 State 类 ---
"""
State 类定义
from arkitect.core.component.context.model import State

class State(BaseModel):
    messages: List[ArkMessage] = []
    parameters: ArkChatParameters = ...
    tools: Optional[List[ChatCompletionTool]] = None
    context_id: Optional[str] = None

# Context自动管理消息历史，State存储所有会话状态
"""
print(context.state.messages)  # 查看历史消息

# Q&A
# Q: 历史消息需要手动管理吗？
# A: 不需要，Context会自动维护。

# --- Hook 注册与用法（四大 hook） ---
"""
四大 Hook 类定义
from arkitect.core.component.context.hooks import (
    PreLLMCallHook, PostLLMCallHook, PreToolCallHook, PostToolCallHook
)

class PreLLMCallHook:
    async def pre_llm_call(self, state: State) -> State: ...

class PostLLMCallHook:
    async def post_llm_call(self, state: State) -> State: ...

class PreToolCallHook:
    async def pre_tool_call(
        self,
        name: str,
        arguments: str,
        state: State,
    ) -> State:
        ...

class PostToolCallHook:
    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response,
        exception,
        state: State,
    ) -> State:
        ...

# 注册方式（只能用Context的set_xxx_hook方法）
# 用法：注意Hook只能返回State，不能返回其它类型
# 注意：XXCallHook Class 下 xx_call 是空方法，需要重写
"""


class MyPreLLMHook(PreLLMCallHook):
    async def pre_llm_call(self, state: State) -> State:
        print("LLM调用前", state)
        return state


class MyPostLLMHook(PostLLMCallHook):
    async def post_llm_call(self, state: State) -> State:
        print("LLM调用后", state)
        return state


class MyPreToolHook(PreToolCallHook):
    async def pre_tool_call(self, name: str, args: str, state: State) -> State:
        print("工具前", name, args)
        return state


class MyPostToolHook(PostToolCallHook):
    async def post_tool_call(
        self, name: str, args: str, resp: Any, exc: Optional[Exception], state: State
    ) -> State:
        print("工具后", name, args, resp, exc)
        return state


context.set_pre_llm_call_hook(MyPreLLMHook())
context.set_post_llm_call_hook(MyPostLLMHook())
context.set_pre_tool_call_hook(MyPreToolHook())
context.set_post_tool_call_hook(MyPostToolHook())

# Q&A
# Q: 可以用其它方式注册hook吗？
# A: 不可以，只能用Context的set_xxx_hook方法。

# --- ContextInterruption（异常与中断） ---
"""
ContextInterruption 类定义
from arkitect.core.component.context.model import ContextInterruption

class ContextInterruption(Exception):
    type: str
    message: str
    details: Optional[dict] = None

# 用法：try/except捕获
# ContextInterruption是“中断信号对象”，不是异常类。
# 不能raise/except，只能检测和消费。
# 用法：在流式输出循环里判断chunk类型，遇到中断时做处理。
"""


# 用法：流式输出循环中检测和处理ContextInterruption
# 假设completion是context.completions.create(...)的异步生成器
async def interruption_example() -> None:
    await context.init()
    completion = await context.completions.create(
        [{"role": "user", "content": "hello"}], stream=True
    )
    async for chunk in completion:
        if isinstance(chunk, ContextInterruption):
            print(f"中断发生！阶段: {chunk.life_cycle}, 原因: {chunk.reason}")
            break
        else:
            # 正常处理输出
            print(getattr(chunk, "content", ""), end="")


# Q&A
# Q: ContextInterruption会自动抛出吗？
# A: 工具异常时框架会自动抛出，也可手动raise。

# --- Stream 流式输出 ---
"""
# stream参数说明
# Context.completions.create(messages, stream=False) 控制是否流式输出。
# - stream=True：返回异步生成器，适合实时输出/大文本/多轮对话，
#   不能直接获取usage等统计量。
# - stream=False：一次性返回完整结果（ArkChatResponse），
#   适合需要统计量、完整内容的场景。
# 推荐：如需统计量/完整内容用stream=False，如需实时输出用stream=True。
"""


# 非流式（stream=False）
async def non_stream_example() -> None:
    await context.init()
    reply = await context.completions.create(
        [{"role": "user", "content": "你好"}], stream=False
    )
    print(reply.choices[0].message.content)
    print(reply.usage)  # 可以获取token统计


# 流式（stream=True）
async def stream_example() -> None:
    await context.init()
    async for chunk in await context.completions.create(
        [{"role": "user", "content": "hello"}], stream=True
    ):
        if hasattr(chunk, "choices"):
            print(chunk.choices[0].delta.content, end="")
    # 不能直接获取usage等统计量


# --- ArkChatResponse 与统计量获取 ---
"""
ArkChatResponse 类定义
from arkitect.types.llm.model import ArkChatResponse, CompletionUsage

class ArkChatResponse(BaseModel):
    id: str
    choices: List[Choice]
    created: int
    model: str
    object: Literal["chat.completion"]
    usage: Optional[CompletionUsage] = None

class CompletionUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

# 获取统计量
"""


async def usage_example() -> None:
    await context.init()
    reply = await context.completions.create(
        [{"role": "user", "content": "你好"}], stream=False
    )
    print(reply.usage)  # 只能在stream=False时获取统计量


# Q&A
# Q: 统计量只能在ArkChatResponse里获取吗？
# A: 是，所有统计信息都在response.usage字段。
# Q: Thinking 模式下，模型思考所消耗的token如何获取？
# A: 通过response.usage.completion_tokens_details.reasoning_tokens来获取。
