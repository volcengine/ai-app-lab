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

export interface detectedObject {
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  label: string,
} 
export interface LLMRequestParams {
  messages?: Message[];
}

export interface Message {
  role: string; // 'user' | 'bot';
  content: any;
}

export interface LLMResponseChunk {
  text: string;
  isLast: boolean;
}

export interface ChatDelta {
  content?: string;
  role?: string;
  reasoning_content?: string;
}

export interface ChatChoice {
  delta: ChatDelta;
  index: number;
  finish_reason: string | null;
}
export interface Good {
  名称: string,
  类别: string,
  子类别: string,
  价格: string,
  销量: string,
  图片链接: string,
  mock?: boolean,
}
export interface ActionDetail {
  name: "vector_search",
  count: number,
  tool_details: [
        {
          name: "vector_search",
            output: Good[]
        }
    ]
}
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
  bot_usage:{
    action_details: ActionDetail[]
}
}