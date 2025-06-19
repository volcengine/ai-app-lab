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
