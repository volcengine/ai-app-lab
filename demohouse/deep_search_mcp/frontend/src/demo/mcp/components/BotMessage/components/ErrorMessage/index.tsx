import { ReactNode } from 'react';

import { ReactComponent as IconRiskText } from '@/images/icon_risk_text.svg';
import { Message } from '@/demo/mcp/types/message';

import styles from './index.module.less';

const ErrorMessage = ({ message, footer }: { message: Message; footer: ReactNode }) => {
  const { content } = message;

  return (
    <div className={`mb-[20px] bg-white rounded-lg border p-[16px] ${styles.assistantMdBoxContainer}`}>
      <div>
        <div className="flex gap-2">
          <IconRiskText className="shrink-0" />
          <span className="break-all">{content}</span>
        </div>
        {/* 回答操作Bar */}
        {footer}
      </div>
    </div>
  );
};

export default ErrorMessage;
