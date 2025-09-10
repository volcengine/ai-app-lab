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

import { BotMessageContext } from '../../store/BotMessage/context';
import { VideoGeneratorBotMessage, VideoGeneratorMessageType, RenderedMessages, ComplexMessage } from '../../types';
import ChatCard from '../ChatCard';
import UserMessage from '../UserMessage';
import VideoGenerateFlow from '../VideoGenerateFlow';
import styles from './index.module.less';

interface Props {
  messages: RenderedMessages;
}

const ChatArea = (props: Props) => {
  const { messages } = props;

  return (
    <div className={styles.wrapper}>
      {messages.map((message, index) => {
        if (message.role === 'user') {
          return <UserMessage id={message.id} key={message.id} content={message.content} />;
        }

        // 简单消息，只有纯文本
        if (message.type !== VideoGeneratorMessageType.Multiple) {
          const botMessage = message as VideoGeneratorBotMessage;
          const versions = botMessage.versions[botMessage.currentVersion];
          return (
            <BotMessageContext.Provider key={index} value={botMessage}>
              {versions
                .filter(version => version.type !== 'slot')
                .map(version => (
                  <ChatCard message={version} key={version.id} phase={botMessage.phase} />
                ))}
            </BotMessageContext.Provider>
          );
        }
        // 复合消息
        return <VideoGenerateFlow key={index} messages={message as ComplexMessage} />;
      })}
    </div>
  );
};

export default ChatArea;
