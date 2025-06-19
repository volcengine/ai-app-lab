import { useContext } from 'react';

import { ChatStoreContext } from '../store/ChatStore/context';

export const useChatInstance = () => {
  const context = useContext(ChatStoreContext);
  return context;
};
