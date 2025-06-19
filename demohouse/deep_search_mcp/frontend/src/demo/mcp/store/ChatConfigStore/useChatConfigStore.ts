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
