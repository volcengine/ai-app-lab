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

export enum EventType {
  Planning = 'planning',
  ReasoningText = 'reasoning_text',
  OutputText = 'output_text',
  AssignTodo = 'assign_todo',
  WebSearch = 'web_search',
  LinkReader = 'link_reader',
  PythonExecutor = 'python_executor',
  KnowledgeBaseSearch = 'knowledge_base_search',
  Function = 'function',
  BrowserUse = 'browser_use',
  ChatPPT = 'chatppt',
}

// Event，planning 过程中的数据结构
export interface Event {
  id: string;
  type: string;
  status?: 'pending' | 'finish'; // 仅 reasoning_text、 output_text、browser_use、chatppt 事件有 status
  result?: any;
  history?: any[];
}

export interface BaseEvent {
  id: string;
  type: string;
}

export interface PlanningEvent extends BaseEvent {
  type: 'planning';
  action: 'made' | 'update' | 'load' | 'done';
  planning: {
    root_task: string;
    items: PlanningItem[];
  };
}

export interface PlanningItem {
  id: string;
  description: string;
  assign_agent: string;
  process_records: any[];
  result_summary: string;
  done: boolean;
}

export interface ReasoningEvent extends BaseEvent {
  type: 'reasoning_text';
  delta: string;
}

export interface OutputTextEvent extends BaseEvent {
  type: 'output_text';
  delta: string;
}

export interface AssignTodoEvent extends BaseEvent {
  type: 'assign_todo';
  agent_name: string;
  planning_item: PlanningItem;
}

export interface WebSearchEvent extends BaseEvent {
  type: 'web_search';
  status: 'pending' | 'completed';
  query?: string;
  success?: boolean;
  error_msg?: string;
  summary?: string;
  references?: WebSearchReference[];
}

export interface WebSearchReference {
  url: string;
  logo_url: string;
  site_name: string;
  title: string;
  summary: string;
  publish_time: string;
  cover_image?: {
    url: string;
    width: number;
    height: number;
  };
  extra: {
    rel_info: string;
    freshness_info: string;
    auth_info: string;
    final_ref: string;
  };
}

export interface LinkReaderEvent extends BaseEvent {
  type: 'link_reader';
  status: 'pending' | 'completed';
  urls?: string[];
  results?: LinkReaderResult[];
}

export interface LinkReaderResult {
  url: string;
  title: string;
  content: string;
  error_message: string;
  error_code: string;
}

export interface PythonExecutorEvent extends BaseEvent {
  type: 'python_executor';
  status: 'pending' | 'completed';
  code?: string;
  success?: boolean;
  error_msg?: string;
  stdout?: string;
}

export interface FunctionEvent extends BaseEvent {
  type: 'function';
  function_name: string;
  status: 'pending' | 'completed';
  function_parameter?: string;
  success?: boolean;
  error_msg?: string;
  function_result?: string;
}
