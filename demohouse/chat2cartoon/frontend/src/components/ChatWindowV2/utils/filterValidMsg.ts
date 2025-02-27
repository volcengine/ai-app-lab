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

import { responseForTextRiskReplaceSet } from '@/constant';

import { BotMessage, UserMessage } from '../context';

type MessageList = (UserMessage | BotMessage)[];
export interface SendBotMessage {
  content: string;
  name?: string; // 群聊需要有，用户不一定有
  role: 'assistant';
}

export interface TextContent {
  type: 'text';
  text: string;
}
export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export interface SendUserMessage {
  name?: string; // 群聊需要有，用户不一定有
  role: 'user';
  content: string | (TextContent | ImageContent)[];
}

const filterUserMsg = (message: UserMessage, passCb: (msg: SendUserMessage) => void) => {
  const userMsg = {
    content: message.content,
    role: 'user' as const,
    ...(message.sender.name ? { name: message.sender.name } : {}),
  };
  userMsg && passCb(userMsg);
};

const filterBotMsg = (message: BotMessage, passCb: (msg: SendBotMessage) => void) => {
  const version = message.versions[message.currentVersion];
  const textMessage = version.find(message => message.type === 'message');

  if (!textMessage) {
    // throw new Error('getMeaningfulMessages: message type is not message');
    return;
  }

  const { content } = textMessage;

  // 是否是审核不通过的消息
  const riskCheckPass = !responseForTextRiskReplaceSet.has(content);

  if (riskCheckPass) {
    const pureMsg = {
      content,
      role: 'assistant' as const,
      ...(message.sender.name ? { name: message.sender.name } : {}),
    };
    passCb(pureMsg);
  }
};

export const filterValidMsg = (messages: MessageList) => {
  // 获取当前有效的消息列表信息
  const meaningfulMessages: {
    content: SendUserMessage['content'] | SendBotMessage['content'];
    name?: string; // 群聊需要有，用户不一定有
    role: 'user' | 'assistant';
  }[] = [];
  // 最后一项可能是assistant 也可能是 user
  // 如果是assistant的占位，需要跳过
  const startIndex =
    messages.length > 0 && messages[messages.length - 1].role === 'assistant'
      ? messages.length - 2
      : messages.length - 1;

  for (let i = startIndex; i >= 0; i--) {
    const message = messages[i];

    if (message.role === 'user') {
      filterUserMsg(message, msg => meaningfulMessages.push(msg));
    }

    if (message.role === 'assistant') {
      filterBotMsg(message, msg => meaningfulMessages.push(msg));
    }
  }
  return meaningfulMessages.reverse();
};
