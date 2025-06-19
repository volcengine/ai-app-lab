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
