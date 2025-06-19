import { create } from 'zustand';

interface IState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}
const initialState = {
  visible: false,
};

export const usePlanningChartVisibleStore = create<IState>((set, get) => ({
  ...initialState,
  setVisible: visible => set({ visible }),
}));
