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
