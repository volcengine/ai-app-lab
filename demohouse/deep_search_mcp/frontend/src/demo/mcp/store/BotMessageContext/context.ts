import { createContext } from 'react';

export interface MessageContext {
  sessionId: string;
  sessionQuery: string;
  finish: boolean;
}

export const BotMessageContext = createContext<MessageContext>({} as MessageContext);
