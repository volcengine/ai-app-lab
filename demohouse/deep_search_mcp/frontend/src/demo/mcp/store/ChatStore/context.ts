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

import { createContext } from 'react';

import { Host } from '../../types';
import { Message } from '../../types/message';
export interface ChatStoreType {
  host: Host;
  debugEnabled?: boolean;
  botId: string;
  url: string;
  chatList: Message[];
  amountConfig: { usage: number; quota: number };
  isChatting: boolean;
  getAmountConfig: () => void;
  config?: any;
  getLastUserMessage: () => Message | undefined;
  getLastBotMessage: () => Message | undefined;
  addChatMessage: (message: Message) => void;
  updateChatMessage: (id: string, updateMessage: (message: Message) => Message) => void;
  clearChatList: () => void;
  updateIsChatting: (isChatting: boolean) => void;
  getHeader?: () => Record<string, Record<string, string>>;
  getHistoryMessage: () => Promise<Message[] | undefined>;
  accountId: string;
  userId: string;
  chatConfig: {
    frequency_penalty: number;
    temperature: number;
    top_p: number;
    max_tokens: number;
    max_tokens_limit: number;
  };
  updateChatConfig: (config: Partial<ChatStoreType['chatConfig']>) => void;
  recoverToCompleteStep: (id: string) => Promise<boolean>;
}

export const ChatStoreContext = createContext<ChatStoreType>({} as unknown as never);
