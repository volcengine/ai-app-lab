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
