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



import { BotMessage, EMessageType, Message, finish_reason } from '../context';
import { textRiskTypeContentMap } from '../constants';

const searchingText = '正在搜索';

export const updateLoadingMessage = (loadingMsg: Message, showSearching: boolean, isHasContent: boolean): Message => {
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
  versions: lastAMsg.versions.map((item, index) => (index === lastAMsg.currentVersion ? targetMsgVersions : item)),
  finish, // 统一更新 BotMessage的 finish
  extra,
});
