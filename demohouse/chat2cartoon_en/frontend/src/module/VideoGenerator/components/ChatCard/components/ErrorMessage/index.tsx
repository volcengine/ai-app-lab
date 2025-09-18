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

import { useContext } from 'react';

import clsx from 'classnames';
import { Divider } from '@arco-design/web-react';

import { ReactComponent as IconRiskText } from '@/images/icon_risk_text.svg';
import { Message } from '@/components/ChatWindowV2/context';

import { BotMessageContext } from '../../../../store/BotMessage/context';
import DebugInfo from '../DebugInfo';
import styles from './index.module.less';
import { AnswerOperation } from '../../../Conversation/components/AnswerOperation';

const ErrorMessage = ({ message }: { message: Message }) => {
  const { content, logid } = message;
  const topMessage = useContext(BotMessageContext);

  return (
    <div
      className={`mb-[20px] assistant-message-container  bg-white rounded-lg border p-[16px] ${styles.assistantMdBoxContainer}`}
    >
      <div className="rounded-lg	border-solid	border border-[#DDE2E9] px-[16px] py-[12px]">
        <div className="flex gap-2">
          <IconRiskText className="shrink-0" />
          <span className="break-all">{content}</span>
        </div>
        {/* 回答操作Bar */}
        {topMessage.finish ? (
          <div className="flex justify-between">
            <AnswerOperation
              isLastMessage={topMessage.isLastMessage}
              className={clsx(!topMessage.isLastMessage && styles.answerOperationHover)}
              assistantMessage={message}
              retryable={topMessage.retryable}
            />
          </div>
        ) : null}
        <Divider style={{ margin: '10px 0' }} type="horizontal" />
        {logid ? <DebugInfo text={logid} /> : null}
      </div>
    </div>
  );
};

export default ErrorMessage;
