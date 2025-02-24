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

import { BotMessage, EMessageType } from '@/components/ChatWindowV2/context';

import SearchTips from './components/SearchTips';
import ErrorMessage from './components/ErrorMessage';
import AssistantMessage from './components/AssistantMessage';
import styles from './index.module.less';

const ChatCard = ({ message, phase }: { message: BotMessage['versions'][number][number]; phase?: string }) => {
  const renderMessage = () => {
    switch (message.type) {
      case EMessageType.Searching:
        return <SearchTips finish={Boolean(message?.finish)} message={message.content} />;
      case EMessageType.Error:
        return <ErrorMessage message={message} />;
      default:
        return message?.content ? <AssistantMessage {...message} phase={phase} /> : null;
    }
  };

  return <div className={styles.message}>{renderMessage()}</div>;
};

export default ChatCard;
