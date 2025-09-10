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

/* eslint-disable @typescript-eslint/naming-convention */

export enum BotProcodeTriggerType {
  BotProcodeTriggerTypeApig = 'apig',
  BotProcodeTriggerTypeArk = 'ark',
}

export interface ProCodeAssistantRuntimeConfig {
  /** vefaas 函数名 */
  VeFaasName?: string;
  /** apig trigger name / bot name */
  TriggerName?: string;
  /** apig service id */
  ServiceId?: string;
  /** default: "/api/v3/bots/chat/completions" */
  ApiPath?: string;
  /** vefaas 应用中心app id */
  VeFaasAppId?: string;
  /** vefaas 函数id */
  FunctionId?: string;
  /** 存量数据不存在，默认值为：apig。新增trigger类型为ark */
  TriggerType?: BotProcodeTriggerType;
}

export interface LLMConfig {
  EndpointId: string;
  SystemPrompt?: string;
}

export interface NoCodeAssistantRuntimeConfig {
  LLMConfig: LLMConfig;
  ActionConfig: string;
  TemplateType: string;
}

export interface OpeningRemarks {
  /** 开场白 */
  OpeningRemark: string;
  /** 开场问题，最多三个 */
  OpeningQuestions: Array<string>;
}

export interface AssistantProCodeChatConfig {
  Memory?: boolean;
  SystemPrompt?: string;
}

export interface TosPath {
  BucketName: string;
  PrefixPath: string;
  ObjectKey: string;
}

export interface Assistant {
  Id?: string;
  Name: string;
  Description: string;
  OpeningRemarks: OpeningRemarks;
  Extra?: any;
}
