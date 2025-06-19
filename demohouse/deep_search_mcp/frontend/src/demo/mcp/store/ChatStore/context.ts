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
