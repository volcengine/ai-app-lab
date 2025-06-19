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

import { create } from 'zustand';

interface IState {
  accountId: string;
  userId: string;
  botId: string;
  getHeader?: () => Record<string, Record<string, string>>;
  setGetHeader: (fn: () => Record<string, Record<string, string>>) => void;
  mcpDebugHelper?: {
    isEnableTrace: boolean;
    iframeloading: boolean;
    currentDebugMessageId: string;
    tlsDebugPanelVisible: boolean;
    toggleDebugPanel: (botId?: string, logId?: string) => void;
  };
  setMcpDebugHelper: (arg: any) => void;
  setAccountId: (accountId: string) => void;
  setUserId: (userId: string) => void;
  setBotId: (botId: string) => void;
}
export const useConfigStore = create<IState>((set, get) => ({
  accountId: '',
  userId: '',
  botId: '',
  getHeader: undefined,
  setGetHeader: (fn: () => Record<string, Record<string, string>>) => set(() => ({ getHeader: fn })),
  mcpDebugHelper: undefined,
  setMcpDebugHelper: (arg: any) => set(() => ({ mcpDebugHelper: arg })),
  setAccountId: (accountId: string) => set(() => ({ accountId })),
  setUserId: (userId: string) => set(() => ({ userId })),
  setBotId: (botId: string) => set(() => ({ botId })),
}));
