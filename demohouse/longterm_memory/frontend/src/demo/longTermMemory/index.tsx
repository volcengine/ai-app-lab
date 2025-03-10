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

import './style.css';

import { FC, useEffect } from 'react';

import { MemoryHistory } from '@/demo/longTermMemory/components/MemoryHistory';
import { Conversation } from '@/demo/longTermMemory/components/Conversation';
import { useResetStore } from '@/demo/longTermMemory/hooks/useResetStore';
import { useConfigStore } from '@/demo/longTermMemory/stores/useConfigStore';

interface IProps {
  apiPath?: string;
}

export const App: FC<IProps> = ({ apiPath }) => {
  const { setApiPath } = useConfigStore();
  useEffect(() => {
    if (apiPath) {
      setApiPath(apiPath);
    }
  }, [apiPath]);
  const { reset } = useResetStore();
  useEffect(
    () => () => {
      reset();
    },
    [],
  );
  return (
    <div className="h-full w-full bg-gray-100 flex flex-col min-w-[900px] overflow-x-auto">
      <div className="flex flex-1 overflow-hidden bg-[#f3f7ff]">
        <Conversation />
        <MemoryHistory />
      </div>
    </div>
  );
};

export default App;
