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
import { v4 as uuidv4 } from 'uuid';

import { Message } from '@/demo/longTermMemory/types';

export interface ChatStore {
  isReasoning: boolean;
  setIsReasoning: (v: boolean) => void;
  chatList: Message[];
  addMsg: (msg: Message) => void;
  updateMsg: (id: string, o: Partial<Message>) => void;
  removeMsg: (id: string) => void;

  addDivider: () => void;
  getCurrentRoundChatList: () => Message[];
  clearChatList: () => void;
  reset: () => void;
}

const initialState = {
  isReasoning: false,
  chatList: [],
};

export const useChatStore = create<ChatStore>((set, get) => ({
  ...initialState,
  setIsReasoning: v => set(() => ({ isReasoning: v })),
  addMsg: msg => set(state => ({ chatList: [...state.chatList, msg] })),
  removeMsg: id =>
    set(state => {
      const newChatList = [...state.chatList];
      const index = newChatList.findIndex(item => item.id === id);
      if (index !== -1) {
        newChatList.splice(index, 1);
      }
      return { chatList: newChatList };
    }),
  updateMsg: (id: string, o: Partial<Message>) =>
    set(state => {
      const newChatList = [...state.chatList];
      const index = newChatList.findIndex(item => item.id === id);
      if (index !== -1) {
        newChatList[index] = { ...newChatList[index], ...o };
      }
      return { chatList: newChatList };
    }),
  addDivider: () =>
    set(state => ({
      chatList: [...state.chatList, { id: uuidv4(), content: '', role: 'divider', type: 'text', finish: true }],
    })),

  getCurrentRoundChatList: () => {
    const { chatList } = get();
    const lastDividerIndex = chatList.findLastIndex(item => item.role === 'divider');
    if (lastDividerIndex === -1) {
      return chatList;
    }
    return chatList.slice(lastDividerIndex + 1);
  },
  clearChatList: () => set(() => ({ chatList: [] })),
  reset: () => set(initialState),
}));
