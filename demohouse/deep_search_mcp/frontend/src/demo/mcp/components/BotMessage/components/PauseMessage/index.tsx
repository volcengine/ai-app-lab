import React, { ReactNode } from 'react';

import { Message } from '@/demo/mcp/types/message';

interface Props {
  message: Message;
  footer: ReactNode;
}

const PauseMessage = (props: Props) => {
  const { message, footer } = props;
  const { content } = message;

  return (
    <div className={`mb-[20px] bg-white rounded-lg border p-[16px]`}>
      <div>
        <div className="flex gap-2">
          <span className="break-all">{content}</span>
        </div>
        {/* 回答操作Bar */}
        {footer}
      </div>
    </div>
  );
};

export default PauseMessage;
