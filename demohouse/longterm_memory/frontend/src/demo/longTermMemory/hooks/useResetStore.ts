import { useConfigStore } from '@/demo/longTermMemory/stores/useConfigStore';
import { useMemoryStore } from '@/demo/longTermMemory/stores/useMemoryStore';
import { useChatStore } from '@/demo/longTermMemory/stores/useChatStore';

export const useResetStore = () => {
  const storeA = useChatStore();
  const storeB = useMemoryStore();
  const storeC = useConfigStore();
  const fnArr = [storeA, storeB, storeC].map(store => store.reset);
  return {
    reset: () => {
      fnArr.forEach(fn => fn());
      console.log('reset');
    },
  };
};
