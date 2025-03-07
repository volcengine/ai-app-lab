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
