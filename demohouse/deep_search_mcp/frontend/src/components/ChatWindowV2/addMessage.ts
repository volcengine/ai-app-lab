import { BotMessage, EMessageType, Message, UserMessage } from './context';

export interface MessageOptions {
  content?: string;
  versions?: Message[][];
  character?: { name?: string; avatar?: string; isHidden?: boolean };
}

/**
 * 标记发送前的最后一条bot msg 为 不可重试，不是最后一条
 * @param messages
 */
export const markLastAssistantMessage = (messages: (BotMessage | UserMessage)[]): (BotMessage | UserMessage)[] => {
  if (messages.length === 0) {
    return messages;
  }

  const latestMessage = messages[messages.length - 1];
  if (latestMessage.role === 'assistant') {
    latestMessage.retryable = false;
    latestMessage.isLastMessage = false;
  }

  return messages;
};

// 创建通用的 sender 对象
const createSender = (character?: { name?: string; avatar?: string }) => ({
  avatar: character?.avatar ?? '',
  name: character?.name ?? '',
});

// 创建用户消息的函数
const createUserMessage = (
  content: string,
  character?: { name?: string; avatar?: string; isHidden?: boolean },
): UserMessage => ({
  id: Date.now(),
  role: 'user',
  content,
  type: 'message',
  sender: createSender(character),
  isHidden: character?.isHidden,
});

// 创建机器人消息的函数
const createBotMessage = (versions: Message[][], character?: { name?: string; avatar?: string }): BotMessage => ({
  role: 'assistant',
  versions,
  currentVersion: 0,
  sender: createSender(character),
  finish: false,
  isLastMessage: true,
  retryable: true,
});

export const messageCreator: {
  [role in 'user' | 'bot']: (options: MessageOptions) => UserMessage | BotMessage;
} = {
  user: ({ content = '', character }) => createUserMessage(content, character),
  bot: ({ versions = [[]], character }) => createBotMessage(versions, character),
};

/**
 * 生成特定的消息
 */
export const genSpecificMessage = {
  loading: () => ({
    id: Date.now(),
    type: EMessageType.Searching,
    content: 'loading',
    finish: false,
  }),
  slot: (newId: number = Date.now()) => ({
    id: newId,
    type: EMessageType.Slot,
    content: '',
  }),
  error: (
    // newId: number = Date.now(),
    type: EMessageType.Message | EMessageType.Error = EMessageType.Error,
    content = '',
    logid = '',
  ) => ({
    // id: newId,
    type,
    content,
    finish: true,
    logid,
  }),
};
