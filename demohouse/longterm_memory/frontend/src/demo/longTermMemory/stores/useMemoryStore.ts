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

import { Memory } from '@/demo/longTermMemory/types';

export const PRESET_MEMORY_LIST: Memory[] = [
  {
    id: '1-1',
    content: '学校计划选拔10位同学来参与毕业大合唱',
    updatedAt: '2024-02-26T05:25:23.617242-08:00',
    createdAt: '2024-02-26T05:25:23.617242-08:00',
  },
  {
    id: '1-2',
    content: '毕业那天会有专业摄影师来拍合照，要求穿黑色西服',
    updatedAt: '2024-02-26T05:25:23.764573-08:00',
    createdAt: '2024-02-26T05:25:23.764573-08:00',
  },
  {
    id: '2-1',
    content: '打算下次休假全家去三亚度假',
    updatedAt: '2024-12-28T05:25:23.764573-08:00',
    createdAt: '2024-12-28T05:25:23.764573-08:00',
  },
  {
    id: '2-2',
    content: '计划带回三亚特产(椰子制品、海鲜干货)',
    updatedAt: '2024-12-28T05:25:23.764573-08:00',
    createdAt: '2024-12-28T05:25:23.764573-08:00',
  },
  {
    id: '3-1',
    content: '喜欢吃辣火锅、橘子、巧克力食品、面条，不爱吃芹菜',
    updatedAt: '2025-02-20T05:25:23.764573-08:00',
    createdAt: '2025-02-20T05:25:23.764573-08:00',
  },
  {
    id: '3-2',
    content: '最近正在协助筹备公司的新人团建，大概 20 人左右',
    updatedAt: '2025-02-20T05:25:23.764573-08:00',
    createdAt: '2025-02-20T05:25:23.764573-08:00',
  },
];

interface MemoryState {
  presetMemoryList: Memory[];
  initPresetMemoryList: () => void;
  memoryList: Memory[];
  setMemoryList: (memoryList: Memory[]) => void;
  reasoningContent: string;
  updateReasoningContent: (ReasoningContent: string) => void;
  isReasoning: boolean;
  reasonStartTime: number;
  reasonEndTime: number;
  setReasonStartTime: (reasonStartTime: number) => void;
  setReasonEndTime: (reasonEndTime: number) => void;
  setIsReasoning: (isReasoning: boolean) => void;
  reset: () => void;
}
const initialState = {
  presetMemoryList: [],
  memoryList: [],
  isReasoning: false,
  reasonStartTime: 0,
  reasonEndTime: 0,
  reasoningContent: '',
};
export const useMemoryStore = create<MemoryState>((set, get) => ({
  ...initialState,
  initPresetMemoryList: () =>
    set(() => {
      const currentTime = new Date().getTime();
      const list = PRESET_MEMORY_LIST.map(item => {
        const group = Number(item.id.split('-')[0]);
        if (group === 1) {
          // 时间 - 380天
          const t = new Date(currentTime - 380 * 24 * 60 * 60 * 1000).toISOString();
          item.createdAt = t;
          item.updatedAt = t;
        } else if (group === 2) {
          // 时间 - 35天
          const t = new Date(currentTime - 95 * 24 * 60 * 60 * 1000).toISOString();
          item.createdAt = t;
          item.updatedAt = t;
        } else if (group === 3) {
          // 时间 - 1天
          const t = new Date(currentTime - 1 * 24 * 60 * 60 * 1000).toISOString();
          item.createdAt = t;
          item.updatedAt = t;
        }
        return item;
      });
      return {
        presetMemoryList: list,
      };
    }),

  setMemoryList: (memoryList: Memory[]) => set(() => ({ memoryList })),
  setIsReasoning: (isReasoning: boolean) => set(() => ({ isReasoning })),
  setReasonStartTime: (reasonStartTime: number) => set(() => ({ reasonStartTime })),
  setReasonEndTime: (reasonEndTime: number) => set(() => ({ reasonEndTime })),
  updateReasoningContent: (reasoningContent: string) => set(() => ({ reasoningContent })),
  reset: () => set(initialState),
}));
