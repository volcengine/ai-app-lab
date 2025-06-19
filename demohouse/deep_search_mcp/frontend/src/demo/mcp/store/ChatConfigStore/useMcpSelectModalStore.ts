import { create } from 'zustand';

import { Tool } from '@/demo/mcp/types/tool';

interface IState {
  // modal
  modalVisible: boolean;
  setModalVisible: (visible: boolean) => void;
  modalCurrentSearchStr: string;
  setModalCurrentSearchStr: (str: string) => void;

  modalCurrentType: string;
  setModalCurrentType: (type: string) => void;
  modalCurrentToolList: Tool[];
  modalCurrentTool?: Tool;
  setModalCurrentTool: (tool: Tool) => void;
}
const initialState = {
  modalVisible: false,
  modalCurrentType: '',
  modalCurrentSearchStr: '',
  modalCurrentToolList: [],
  modalCurrentTool: undefined,
};
export const useMcpSelectModalStore = create<IState>((set, get) => ({
  ...initialState,
  setModalVisible: (visible: boolean) => set(() => ({ modalVisible: visible })),
  setModalCurrentSearchStr: (str: string) => set(() => ({ modalCurrentSearchStr: str })),
  setModalCurrentType: (type: string) => set(() => ({ modalCurrentType: type })),
  setModalCurrentTool: (tool?: Tool) => set(() => ({ modalCurrentTool: tool })),
}));
