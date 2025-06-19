import { textRiskTypeContentMap } from '../constants';
import {
  type BotMessage,
  EMessageType,
  type Message,
  type finish_reason,
} from '../context';

const searchingText = '正在搜索';

export const updateLoadingMessage = (
  loadingMsg: Message,
  showSearching: boolean,
  isHasContent: boolean,
): Message => {
  if (showSearching) {
    // 如果文本是正在搜索，这次chunk只更新文本 loading -> searching
    return {
      ...loadingMsg,
      type: EMessageType.Searching,
      content: searchingText,
    };
  }
  // 优化 只有 当前回答有内容，才设置 loading 卡片为 finish
  if (isHasContent) {
    return {
      ...loadingMsg,
      type: EMessageType.Searching,
      finish: true,
    };
  }
  return {
    ...loadingMsg,
    type: EMessageType.Searching,
  };
};

const isNeverSlice = (searchContent: string) => {
  const contentValues = Object.values(textRiskTypeContentMap);
  return contentValues.some(({ content }) => content === searchContent);
};

/**
 * 更新目标消息的内容、类型等信息
 * @param targetMsg
 * @param content
 * @param finish
 * @param finish_reason
 * @param type
 * @param logid
 * @param usage
 */
export const updateTargetMessage = (
  targetMsg: Message,
  isUseSearch = false,
  content: string,
  finish: boolean,
  finish_reason: finish_reason | undefined,
  type: EMessageType,
  logid?: string,
  usage?: Message['usage'],
): Message => {
  content;

  // eslint-disable-next-line no-nested-ternary
  const pureContent = isNeverSlice(content)
    ? content
    : // eslint-disable-next-line no-nested-ternary
      type === EMessageType.Error && content !== searchingText
      ? content
      : isUseSearch
        ? content.slice(4)
        : content;
  return {
    ...targetMsg,
    content: pureContent,
    finish: type === EMessageType.Error ? true : finish,
    ...(finish_reason && { finish_reason }),
    type,
    ...(logid && { logid }),
    ...(usage && { usage }),
  };
};

/**
 * 拼接最终更新的versions
 * @param targetMsgVersions
 * @param loadingMsgIdx
 * @param targetMsgIdx
 * @param updatedLoadingMsg
 * @param updatedTargetMsg
 * @param references
 * @param finish
 * @param documentRefCardVisible
 */
export const updateVersionsWithExtrasAndMessages = (
  updatedLoadingMsg: Message,
  updatedTargetMsg: Message,
  // eslint-disable-next-line max-params
): Message[] => [updatedLoadingMsg, updatedTargetMsg];

/**
 * 更新lastAssistantMessage的versions
 * @param lastAMsg 最后一条 bot msg
 * @param targetMsgVersions 要替换的 msg versions (生成的回答)
 * @param finish BotMessage的finish
 */
export const updateBotMessageVersions = (
  lastAMsg: BotMessage,
  targetMsgVersions: Message[],
  finish: boolean,
  extra?: Record<string, any>,
) => ({
  ...lastAMsg,
  versions: lastAMsg.versions.map((item, index) =>
    index === lastAMsg.currentVersion ? targetMsgVersions : item,
  ),
  finish, // 统一更新 BotMessage的 finish
  extra,
});
