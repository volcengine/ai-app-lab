import sys
import os
import time
from copy import deepcopy
from typing import *
import yaml
from jinja2 import Template

# 同层级import
from utils import *
from prompt import SYSTEM_PROMPT, USER_PROMPT

import os
from openai import OpenAI
import openai

client_doubao = OpenAI(
    # 此为默认路径，您可根据业务所在地域进行配置
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # 从环境变量中获取您的 API Key
    api_key=os.environ['VOLC_API_KEY'],
)


current_file_path = os.path.abspath(__file__)
agent_dir = os.path.dirname(current_file_path)
root_dir = os.path.dirname(agent_dir)
tools_yaml_path = os.path.join(root_dir, 'tools', 'tools_desc.yaml')

if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# 插入路径
# 相应的tools
from tools import func_map


def load_tools_from_yaml(yaml_path, render_project_path: Optional[str] = None):
    """加载工具描述文件并解析结构
    Args:
        yaml_path: 工具描述文件路径
    Returns:
        tuple: (完整内容, 工具名称列表, {工具名称: 参数列表})
    """
    with open(yaml_path, 'r') as f:
        tools_data = yaml.safe_load(f)
    
    tool_names = []
    params_dict = {}
    
    for tool in tools_data:
        if tool['type'] == 'function':
            func_info = tool['function']
            # 需要填充路径
            if render_project_path is not None:
                func_info['description'] = Template(func_info['description']).render(project_path = render_project_path)
                # print(func_info['parameters']['properties'])
                for _, param_value in func_info['parameters']['properties'].items():
                    param_value['description'] = Template(param_value['description']).render(project_path = render_project_path)
            tool_name = func_info['name']
            tool_names.append(tool_name)
            
            # 提取参数列表
            params = []
            if 'parameters' in func_info and 'properties' in func_info['parameters']:
                params = list(func_info['parameters']['properties'].keys())
            params_dict[tool_name] = params
            
    return tools_data, tool_names, params_dict


def render_prompt(prompt_template, **kwargs):
    template = Template(prompt_template)
    return template.render(**kwargs)


def process_stream_output(completion: openai.types.chat.ChatCompletion):
    content = ""
    reasoning_content = ""
    tool_calls = []
    usage = {} # 防止没有usage的情况
    finish_reason = ""
    tool_call_index = None
    
    for chunk in completion:
        if hasattr(chunk, "usage") and chunk.usage:
            usage = chunk.usage.to_dict()
        if len(chunk.choices) > 0:
            if hasattr(chunk.choices[0], "finish_reason") and chunk.choices[0].finish_reason:
                finish_reason = chunk.choices[0].finish_reason
            if hasattr(chunk.choices[0].delta, "content") and chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                
                if not content:
                    yield "\n**正文**：\n" + token
                else:
                    yield token
                content += token
            if hasattr(chunk.choices[0].delta, "reasoning_content") and chunk.choices[0].delta.reasoning_content:
                token = chunk.choices[0].delta.reasoning_content
                if not reasoning_content:
                    yield "\n**思考过程**：\n" + token
                else:
                    yield token
                reasoning_content += token
            if hasattr(chunk.choices[0].delta, "tool_calls") and chunk.choices[0].delta.tool_calls:
                # print(chunk)
                if hasattr(chunk.choices[0].delta.tool_calls[0].function, "name") and chunk.choices[0].delta.tool_calls[0].function.name:
                    tool_call = chunk.choices[0].delta.tool_calls[0]
                    arguments_token = tool_call.function.arguments
                    name = tool_call.function.name
                    current_tool_call_index = tool_call.index
                    tool_calls.append(tool_call)
                    if tool_call_index is None:
                        tool_call_index = current_tool_call_index
                        yield f"**请求工具**（tool={name}）参数：\n```json\n{arguments_token}"
                    elif tool_call_index != current_tool_call_index:
                        tool_call_index = current_tool_call_index
                        yield f"\n```\n\n**请求工具**（tool={name}）参数：\n```json\n{arguments_token}"
                else:
                    arguments_token = chunk.choices[0].delta.tool_calls[0].function.arguments
                    if arguments_token:
                        tool_calls[-1].function.arguments += arguments_token
                        yield arguments_token
    if tool_call_index is not None:
        yield "\n```\n"
    # tool_calls需要转换成Json
    tool_calls = [tool_call.to_dict() for tool_call in tool_calls]
    
    DEFAULT_CONTENT_WITH_TOOL_CALL = "[准备调用相应工具执行]"
    DEFAULT_CONTENT_WITHOUT_TOOL_CALL = "[思考中]"
    result = {"role": "assistant"}
    if tool_calls:
        result['tool_calls'] = tool_calls
        if len(content.strip()) == 0:
            # 为了防止切换成claude调用content为空
            content = DEFAULT_CONTENT_WITH_TOOL_CALL
    else:
        if len(content.strip()) == 0:
            # 为了防止切换成claude调用content为空
            content = DEFAULT_CONTENT_WITHOUT_TOOL_CALL    
    result.update({
        'content': content,
        'reasoning_content': reasoning_content,
        'usage': usage,
        'finish_reason': finish_reason
    })
    yield result


def get_llm_response(messages: List[Dict[str, str]], model_card: str, tools: List[Dict[str, Any]]):
    """获取LLM的响应
    """
    completion = client_doubao.chat.completions.create(
        stream=True,
        model=os.environ['VOLC_THINKING_MODEL_EP'],
        messages=messages,
        extra_body={"thinking": {"type": "enabled", "budget_tokens": 2000}},
        tools=tools,
        stream_options={"include_usage": True}
    )
    for res in process_stream_output(completion):
        yield res

class game_agent(object):
    def __init__(self, project_path: str):
        self.project_path = project_path
        self.model_card = None
        self.messages = []
        self.tools = []
        self.tools_name_list = []
        self.tools_params_dict = {}
        self.volc_config = None
        self.current_step = 0
        self.max_step = 30
        self.is_finished = False
        
    def initialize(self, chat_history_messages: List[Dict]):
        chat_history = convert_messages_to_chat_history(chat_history_messages)
        print(chat_history)
        self.messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": render_prompt(USER_PROMPT, chat_history=chat_history)
            }
        ]
        tools, tools_name_list, tools_params_dict = load_tools_from_yaml(tools_yaml_path, render_project_path=self.project_path)
        print(tools)
        self.tools = tools
        self.tools_name_list = tools_name_list
        self.tools_params_dict = tools_params_dict

    def __validate_tool_name(self, target_tool_name: str) -> Optional[str]:
        if target_tool_name not in self.tools_name_list:
            return f"工具{target_tool_name}不在工具列表中"
        return None
    
    def __validate_tool_parameter_name(self, tool_name: str, tool_parameters: Dict[str, Any]) -> Optional[str]:
        # 校验参数名是否正确
        bad_param_name = False
        if tool_parameters is None:
            return None
        for param_name in tool_parameters.keys():
            if param_name not in self.tools_params_dict[tool_name]:
                bad_param_name = True
                break
        if bad_param_name:
            current_param_name_list = str(list(tool_parameters.keys()))
            correct_param_name_list = str(tools_params_dict[tool_name])
            return f"工具{tool_name}的参数名称错误，当前参数列表为{current_param_name_list}，正确参列表数应该为{correct_param_name_list}"
        return None
    
    def exec_tools(self, tool_call: Dict[str, Any]):
        tool_id = tool_call['id']
        tool_name = tool_call['function']['name']
        tool_parameters_origin = tool_call['function'].get('arguments', '')
        print(">" * 20)
        print("工具名称：", tool_name)
        print("工具参数：", tool_parameters_origin)
        # 验证tool_name
        tool_name_valid_result = self.__validate_tool_name(tool_name)
        if tool_name_valid_result is not None:
            tool_result = tool_name_valid_result
        else:
            try:
                tool_parameters = json.loads(tool_call['function'].get('arguments', """{}"""))
                tool_parameters = {} if tool_parameters is None else tool_parameters
                # 校验参数名是否正确
                tool_param_valid_result = self.__validate_tool_parameter_name(tool_name, tool_parameters)
                if tool_param_valid_result is not None:
                    tool_result = tool_param_valid_result
                else:
                    # 执行工具
                    tool_result = func_map[tool_name](**tool_parameters)
            except json.JSONDecodeError as e:
                tool_result = f"工具{tool_name}的参数解析失败，原始参数为：{tool_parameters_origin}"
                tool_parameters = {"error_message": tool_result}

        # 生成工具响应
        print(">" * 20)
        print("工具返回结果：", tool_result)
        print("<" * 20)
        tool_response = {
            "role": "tool",
            "tool_call_id": tool_id,
            "name": tool_name,
            "content": tool_result,
            "tool_parameters": tool_parameters # 用于streamlit 前端展示
        }
        return tool_response
    
    def add_message(self, message: Dict[str, Any]):
        self.messages.append(message)

    def get_next_message(self):
        for message in get_llm_response(self.messages, self.model_card, self.tools):
            if "usage" in message:
                self.messages.append(message)
            else:
                yield message
        print("=" * 20)
        last_message = self.messages[-1]
        print("=" * 20)
        tool_calls = last_message.get('tool_calls', [None])
        for tool_call in tool_calls:
            # 如果有工具调用，处理工具响应
            if tool_call:
                tool_response = self.exec_tools(tool_call)
                self.messages.append(tool_response)
                tool_result = tool_response['content']
                tool_name = tool_response['name']
                yield f"\n**工具执行（tool={tool_name}）**结果\n：{tool_result}\n"
                if tool_name == "attempt_completion":
                    self.is_finished = True
                    break
        self.current_step += 1
        if self.current_step >= self.max_step:
            self.is_finished = True