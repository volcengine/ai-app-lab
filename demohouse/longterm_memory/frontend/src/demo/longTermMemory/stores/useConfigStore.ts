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
