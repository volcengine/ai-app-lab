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

/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { createContext, Dispatch, SetStateAction } from 'react';

import { Assistant } from '@/types/assistant';

/* eslint-disable @typescript-eslint/naming-convention */
export type finish_reason = 'stop' | 'length' | 'content_filter';

export enum EMessageType {
  Message = 'message',
  Searching = 'searching',
  Cards = 'cards',
  WeatherCard = 'weather_card',
  Error = 'error',
  Slot = 'slot',
}

export interface Message {
  id: number;
  content: string;
  audio?: { type: 'Buffer'; data: number[] };
  finish_reason?: finish_reason;
  finish?: boolean;
  type: EMessageType;

  usage?: {
    totalTokens: number;
    tokensPerSecond: number;
    duration: string;
  };

  logid?: string;

  // 仅供card 使用,默认开启
  enableAnimate?: boolean;
}

export interface UserMessage {
  id: number;
  role: 'user';
  content: string;
  type: 'message';
  sender: {
    avatar: string;
    name: string;
  };
  isHidden?: boolean; // 是否隐藏
}

export interface BotMessage {
  role: 'assistant';
  versions: Message[][];
  currentVersion: number;
  finish: boolean;

  /**
   * 关于消息发送者的信息，包括头像和姓名
   */
  sender: {
    avatar: string;
    name: string;
  };

  /**
   * 是否是最后一条数据
   */
  isLastMessage: boolean;

  /**
   * 是否可以重试
   */
  retryable: boolean;
  /**
   * 额外信息
   */
  extra?: Record<string, any>;
}

export interface ChatWindowContextType {
  /**
   * 当前的消息结构列表
   */
  messages: (UserMessage | BotMessage)[];

  /**
   * 设置新的消息结构列表，注意不是添加
   */
  setMessages: Dispatch<SetStateAction<(UserMessage | BotMessage)[]>>;

  /**
   * 当前是否正在发送消息
   */
  sending: boolean;

  /**
   * 从输入框发送消息
   * @param message
   */
  sendMessageFromInput: (message: string) => void;

  /**
   * 隐式的发送消息
   * @param message
   */
  sendMessageImplicitly: (message: string) => void;

  /**
   * 让智能体开始回复消息
   * @param target 是否指定哪位智能体角色进行消息回复
   */
  startReply: (target?: string) => void;

  /**
   * 插入一条bot的空消息
   * @param target
   */
  insertBotEmptyMessage: (character?: { name?: string; avatar?: string }) => void;

  /**
   * 重新生成回答
   */
  retryMessage: () => void;

  /**
   * 重置消息记录
   */
  resetMessage: (report?: { type: 'total' | 'reset' }) => void;
  /**
   * 从最后一个assistant回答中，把loading卡片删除
   * 在切换回答时调用，避免重复出卡片动效
   * @param nextVersion 需要移除的version的下标
   */
  removeLoadingCardInVersions: (versionIdx: number) => void;
  assistantInfo: Assistant;
}

export const ChatWindowContext = createContext<ChatWindowContextType>({} as unknown as never);
