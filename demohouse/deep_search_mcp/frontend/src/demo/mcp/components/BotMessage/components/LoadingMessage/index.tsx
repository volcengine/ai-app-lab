import React from 'react';

import { ReactComponent as IconLoading } from '@/demo/mcp/assets/icon_loading.svg';

import MessageContainer from '../MessageContainer';

const LoadingMessage = () => (
  <MessageContainer>
    <IconLoading className="force-icon-loading" />
  </MessageContainer>
);

export default LoadingMessage;
