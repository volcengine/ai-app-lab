import { create } from 'zustand';

export enum TabsKey {
  Round = 'round',
  Mcp = 'mcp',
}
interface IState {
  // drawer
  drawerVisible: boolean;
  setDrawerVisible: (visible: boolean) => void;
  drawerCurrentTab: TabsKey;
  setDrawerCurrentTab: (tab: TabsKey) => void;
}
const initialState = {
  drawerVisible: true,
  drawerCurrentTab: TabsKey.Round,
};

export const useSettingDrawerStore = create<IState>((set, get) => ({
  ...initialState,
  setDrawerVisible: (visible: boolean) => set(() => ({ drawerVisible: visible })),
  setDrawerCurrentTab: (tab: TabsKey) => set(() => ({ drawerCurrentTab: tab })),
}));
