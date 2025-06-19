import { create } from 'zustand';

interface IState {
  // drawer
  autopeDrawerVisible: boolean;
  sessionQuery: string;
  sessionId: string;
  setAutoPEDrawerVisible: (visible: boolean, sessionId?: string, sessionQuery?: string) => void;
}

export const useAutoPEStore = create<IState>(set => ({
  autopeDrawerVisible: false,
  sessionQuery: '',
  sessionId: '',
  setAutoPEDrawerVisible: (visible: boolean, sessionId?: string, sessionQuery?: string) =>
    set(() => ({ autopeDrawerVisible: visible, sessionId, sessionQuery })),
}));
