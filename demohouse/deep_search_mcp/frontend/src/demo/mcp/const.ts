// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import BrowserUse from '@/demo/mcp/assets/browser_use.png';
import ChatPPT from '@/demo/mcp/assets/chat_ppt.png';
import Knowledgebase from '@/demo/mcp/assets/knowledge.png';
import LinkReader from '@/demo/mcp/assets/link_reader.png';
import PythonLogo from '@/demo/mcp/assets/python.png';
import WebSearch from '@/demo/mcp/assets/search.png';
import TlsLogo from '@/demo/mcp/assets/tls.png';
import type { Tool, ToolType } from '@/demo/mcp/types/tool';

export enum DebugParamName {
  max_tokens = 'max_tokens',
  frequency_penalty = 'frequency_penalty',
  temperature = 'temperature',
  top_p = 'top_p',
  stream = 'stream',
}
export const MCP_TOOL_LIST: Tool[] = [
  {
    id: 'web_search',
    type: '检索工具',
    icon: WebSearch,
    name: '联网搜索',
    description: '联网搜索工具，用于实时搜索互联网公开域内容',
    required: true,
    content: `{"mcpServers":{"web_search":{"command":"uvx","args":["--from","git+https://github.com/volcengine/ai-app-lab#subdirectory=mcp/server/mcp_server_ark","mcp-server-ark"],"env":{"ARK_BOT_ID":"your-bot-id","ARK_API_KEY":"your-apikey","ARK_BOT_DESCRIPTION":"这是联网搜索工具，如果需要搜索互联网上的内容，请使用此工具。输入为关键词，每次最多一个关键词","ARK_BOT_NAME":"web_search"}}}}`,
  },
  {
    id: 'link_reader',
    type: '信息处理',
    icon: LinkReader,
    name: '网页解析',
    description: '网页解析工具，可获取和解析 url 链接下的标题和内容',
    required: true,
    content: `{"mcpServers":{"link_reader":{"command":"uvx","args":["--from","git+https://github.com/volcengine/ai-app-lab#subdirectory=mcp/server/mcp_server_ark","mcp-server-ark"],"env":{"ARK_TOOL_LINK_READER":"True","ARK_API_KEY":"your-apikey"}}}}`,
  },
  {
    id: 'knowledgebase',
    type: '检索工具',
    icon: Knowledgebase,
    name: '知识库',
    description:
      '在知识库内进行检索的工具。该知识库预置了方舟大模型平台的产品文档，如需咨询相关信息，请使用该工具',
    content: `{
  "mcpServers": {
    "knowledgebase": {
      "command": "uvx",
        "args": [
          "--from",
          "git+https://github.com/volcengine/ai-app-lab#subdirectory=mcp/server/mcp_server_knowledgebase",
          "mcp-server-knowledgebase"
        ],
      "env": {
        "VOLC_ACCESSKEY": "your-access-key",
        "VOLC_SECRETKEY": "your-secret-key",
        "VIKING_KB_COLLECTION_NAME": "your-collection-name"
      }
    }
  }
}`,
  },
  {
    id: 'code',
    type: '开发者工具',
    icon: PythonLogo,
    name: 'Python代码执行器',
    description: '提供在沙箱环境运行 python脚本的服务',
    content: `{"mcpServers":{"sandbox":{"command":"uvx","args":["--from","git+https://github.com/volcengine/ai-app-lab#subdirectory=mcp/server/mcp_server_vefaas_sandbox","mcp-server-vefaas-sandbox"],"env":{"SANDBOX_API":"your-sandbox-url"}}}}`,
  },
  {
    id: 'browser_use',
    type: '开发者工具',
    icon: BrowserUse,
    name: '浏览器使用',
    description: '提供在沙箱环境自动操作虚拟浏览器的服务',
    content: `{"mcpServers":{"vefaas-browser-use":{"command":"uvx","args":["--from","git+https://github.com/volcengine/mcp-server#subdirectory=server/mcp_server_vefaas_browser_use","mcp-server-vefaas-browser-use"],"env":{"BROWSER_USE_ENDPOINT":"https://xxxxxxxxxxx.apigateway-cn-beijing.volceapi.com"}}}}`,
  },
  {
    id: 'tls',
    type: '云服务-存储',
    icon: TlsLogo,
    name: '日志服务',
    description:
      '提供将文本转换为日志查询语句的工具(text2sql)和搜索TLS日志的工具(search_logs)',
    content: `{
    "mcpServers": {
        "tls": {
            "command": "uvx",
            "args": [
            "--from",
            "git+https://github.com/volcengine/ai-app-lab#subdirectory=mcp/server/mcp_server_tls",
            "mcp-server-tls"
          ],
            "env": {
                "VOLC_ACCESSKEY": "your-access-key-id",
                "VOLC_SECRETKEY": "your-access-key-secret",
                "TLS_TOPIC_ID": "your-topic-id",
                "ACCOUNT_ID": "your-account-id"
            }
        }
    }
}
`,
  },
  {
    id: 'chatppt',
    type: '内容生成',
    icon: ChatPPT,
    name: '必优-ChatPPT',
    description: '提供高效的PPT内容生成服务',
    content: `{"mcpServers":{"chatppt":{"command":"npx","args":["-y","@chatppt/mcp-server-chatppt"],"env":{"API_KEY":"<YOUR_API_KEY>"}}}}`,
  },
];

export const MCP_TOOL_CALL_MAP = {
  web_search: {
    type: 'web_search',
    iconSrc: WebSearch,
    name: '联网搜索',
  },
  link_reader: {
    type: 'link_reader',
    iconSrc: LinkReader,
    name: '网页解析',
  },
  knowledge_base_search: {
    type: 'knowledge_base_search',
    iconSrc: Knowledgebase,
    name: '知识库',
  },
  python_executor: {
    type: 'python_executor',
    iconSrc: PythonLogo,
    name: 'Python代码执行器',
  },
  function: {
    type: 'function',
    iconSrc: TlsLogo,
    name: '日志服务',
  },
  get_recent_logs: {
    type: 'get_recent_logs',
    iconSrc: TlsLogo,
    name: '日志服务',
  },
  search_logs: {
    type: 'search_logs',
    iconSrc: TlsLogo,
    name: '日志服务',
  },
  text_to_sql: {
    type: 'text_to_sql',
    iconSrc: TlsLogo,
    name: '日志服务',
  },
  browser_use: {
    type: 'browser_use',
    iconSrc: BrowserUse,
    name: '浏览器使用',
  },
  chatppt: {
    type: 'chatppt',
    iconSrc: ChatPPT,
    name: '必优-ChatPPT',
  },
};

export const MCP_TOOL_TYPE_LIST: ToolType[] = [
  {
    name: '检索工具',
    description: '提供搜索相关功能的服务',
  },
  {
    name: '信息处理',
    description: '提供处理与解析相关信息的高效工具',
  },
  {
    name: '开发者工具',
    description: '提供代码运行、浏览器使用等高效实用的开发者工具',
  },
  {
    name: '云服务-存储',
    description: '提供火山引擎云上存储相关的服务',
  },
  {
    name: '内容生成',
    description: '提供高效的内容生成服务',
  },
];

export const BOT_CHAT_CONFIG_ARR = [
  {
    Name: DebugParamName.max_tokens,
    Key: 'max_tokens',
    Type: 'int',
    DefaultValue: 4,
    getDescription: (min?: number, max?: number) =>
      `模型可以生成的最大 token 数量，输入 token 和输出 token 的总长度还受模型的上下文长度限制。取值范围为 [${min}, ${max}]`,
    Min: 0,
    Max: 4,
  },
  {
    Name: DebugParamName.frequency_penalty,
    Key: 'frequency_penalty',
    Type: 'float',
    DefaultValue: 0,
    Min: -2.0,
    Max: 2.0,
    getDescription: () =>
      '频率惩罚系数。如果值为正，会根据新 token 在文本中的出现频率对其进行惩罚，从而降低模型逐字重复的可能性。取值范围为 [-2.0, 2.0]',
  },
  {
    Name: DebugParamName.temperature,
    Key: 'temperature',
    Type: 'float',
    Min: 0.0,
    Max: 1.0,
    DefaultValue: 1,
    getDescription: () =>
      '采样温度。控制了生成文本时对每个候选词的概率分布进行平滑的程度。取值范围为 [0, 1]',
  },
  {
    Name: DebugParamName.top_p,
    Key: 'top_p',
    Type: 'float',
    DefaultValue: 0.7,
    getDescription: () =>
      '核采样概率阈值。模型会考虑概率质量在 top_p 内的 token 结果。取值范围为 [0, 1]',
    Min: 0,
    Max: 1.0,
  },
];
