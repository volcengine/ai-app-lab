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

import { useMemo } from 'react';

import { create } from 'zustand';

import { Tool, ToolType } from '@/demo/mcp/types/tool';

interface IState {
  //
  personalized: boolean;
  setPersonalized: (personalized: boolean) => void;
  // round setting
  maxSearchWords: number;
  maxPlanningRounds: number;
  setMaxSearchWords: (maxSearchWords: number) => void;
  setMaxPlanningRounds: (maxPlanningRounds: number) => void;
  // tool
  toolList: Tool[];
  setToolList: (toolList: Tool[]) => void;
  enableToolList: Tool[];
  setEnableToolList: (enableToolList: Tool[]) => void;
  toolTypes: ToolType[];
  setToolTypes: (toolTypes: ToolType[]) => void;
  //
  apiPath: string;
  setApiPath: (apiPath: string) => void;
}
const initialState = {
  personalized: true,
  maxSearchWords: 5,
  maxPlanningRounds: 5,
  toolList: [],
  enableToolList: [],
  toolTypes: [],
  //
  apiPath: 'https://scvjt16070epl9t0qvecg.apigateway-cn-beijing.volceapi.com/api/response',
};
export const useChatConfigStore = create<IState>((set, get) => ({
  ...initialState,
  setPersonalized: (personalized: boolean) => set(() => ({ personalized })),
  setMaxSearchWords: (maxSearchWords: number) => set(() => ({ maxSearchWords })),
  setMaxPlanningRounds: (maxPlanningRounds: number) => set(() => ({ maxPlanningRounds })),
  setToolList: (toolList: Tool[]) => set(() => ({ toolList })),
  setEnableToolList: (toolList: Tool[]) => set(() => ({ enableToolList: toolList })),
  setToolTypes: (toolTypes: ToolType[]) => set(() => ({ toolTypes })),
  setApiPath: (apiPath: string) => set(() => ({ apiPath })),
}));

export const useToolTreeList = () => {
  const { toolTypes, toolList, enableToolList } = useChatConfigStore();
  const enabledToolTreeList = useMemo(
    () =>
      toolTypes
        .map(item => ({
          ...item,
          children: enableToolList.filter(tool => tool.type === item.name),
        }))
        .filter(item => Boolean(item.children.length)),
    [toolTypes, enableToolList],
  );
  const toolTreeList = useMemo(
    () =>
      toolTypes
        .map(item => ({
          ...item,
          children: toolList.filter(tool => tool.type === item.name),
        }))
        .filter(item => Boolean(item.children.length)),
    [toolTypes, toolList],
  );
  return {
    enabledToolTreeList,
    toolTreeList,
    toolList,
    enableToolList,
  };
};
