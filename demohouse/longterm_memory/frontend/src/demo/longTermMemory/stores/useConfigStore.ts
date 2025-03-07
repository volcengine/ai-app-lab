import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';


interface IState {
  userId: string;
  setUserId: (userId: string) => void;
  botId: string;
  setBotId: (botId: string) => void;
  apiPath: string;
  setApiPath: (apiPath: string) => void;
  reset: () => void;
}
const initialState = {
  userId: uuidv4(),
  botId: '-',
  apiPath:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:8082/memory_api'
      : '', //按实际情况修改
};
export const useConfigStore = create<IState>((set, get) => ({
  ...initialState,
  setUserId: (userId: string) => set(() => ({ userId })),
  setBotId: (botId: string) => set(() => ({ botId })),
  setApiPath: (apiPath: string) => set(() => ({ apiPath })),
  reset: () => set(() => ({ ...initialState, userId: uuidv4() })),
}));
