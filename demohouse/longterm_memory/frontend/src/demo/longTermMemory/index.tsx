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
