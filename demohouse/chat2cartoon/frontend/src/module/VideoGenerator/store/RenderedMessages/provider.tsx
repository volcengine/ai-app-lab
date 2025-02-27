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

/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-depth */
import { PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';


import { cloneDeep, pick } from 'lodash';
import { Message } from '@arco-design/web-react';

import { ChatWindowContext, BotMessage, EMessageType, UserMessage } from '@/components/ChatWindowV2/context';

import { RenderedMessagesContext } from './context';
import {
  RenderedMessages,
  RunningPhaseStatus,
  UserConfirmationData,
  UserConfirmationDataKey,
  VideoGeneratorBotMessage,
  VideoGeneratorMessageType,
  VideoGeneratorTaskPhase,
  VideoGeneratorUserMessage,
} from '../../types';
import { useIndexedDB } from '../../hooks/useIndexedDB';
import {
  combinationFirstFrameDescription,
  combinationRoleDescription,
  combinationVideoDescription,
  matchFirstFrameDescription,
  matchRoleDescription,
  matchVideoDescription,
} from '../../utils';
import { PHASE_MAP } from '../../constants';
import useMediaRelevance from '../../hooks/useMediaRelevance';
import useGenerateStatus from '../../hooks/useGenerateStatus';

interface Props {
  storeUniqueId: string;
}

const runOrder = Object.values(VideoGeneratorTaskPhase);

const RenderedMessagesProvider = (props: PropsWithChildren<Props>) => {
  const { children, storeUniqueId } = props;
  const {
    messages,
    setMessages,
    sendMessageImplicitly,
    sendMessageFromInput,
    insertBotEmptyMessage,
    startReply,
    resetMessage,
  } = useContext(ChatWindowContext);
  const dbInstance = useIndexedDB(storeUniqueId);
  const mediaRelevance = useMediaRelevance(storeUniqueId);
  const { flowStatus, runningPhaseStatusRef, runningPhaseStatus, updateRunningPhaseStatus, checkFinishMessage } =
    useGenerateStatus();

  const complexMessagesRef = useRef<Record<string, VideoGeneratorBotMessage[]>>({});
  const userConfirmMessageRef = useRef<UserConfirmationData>();
  const regenerationDescriptionRef = useRef<{ descriptionsData: UserConfirmationData; uniqueKey: string }>();
  const timerRef = useRef<number>();
  const autoNextRef = useRef<boolean>(false);
  const initMessages = useRef<boolean>(false);

  const [renderedMessages, setRenderedMessages] = useState<RenderedMessages>([]);
  const [userConfirmData, setUserConfirmData] = useState<UserConfirmationData>();
  const [phaseStack, setPhaseStack] = useState<string[]>([]);
  const [runningPhase, setRunningPhase] = useState<string>('');
  const [autoNext, setAutoNext] = useState<boolean>(false);
  const [isEditing, setEditing] = useState<boolean>(false);

  const miniMapRef = useRef<{ close: () => void }>(null);

  const storePhase = useMemo(() => {
    if (phaseStack.length === 0) {
      return '';
    }
    return phaseStack[phaseStack.length - 1];
  }, [phaseStack]);

  const updateAutoNext = (val: boolean) => {
    autoNextRef.current = val;
    setAutoNext(val);
  };

  const sendNextMessage = (content?: string, isHidden = true) => {
    if (messages.length) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && !lastMessage.finish) {
        updateRunningPhaseStatus(RunningPhaseStatus.Pending);
        return;
      }
    }
    updateRunningPhaseStatus(RunningPhaseStatus.Pending);
    // 发送下一条消息
    if (isHidden) {
      sendMessageImplicitly(content ?? '下一步');
    } else {
      sendMessageFromInput(content ?? '下一步');
    }
    // 关闭流程图
    miniMapRef.current?.close();

    // 插入 bot 占位
    setTimeout(() => {
      insertBotEmptyMessage();
      // 请求接口
      startReply();
    }, 10);
  };

  // 更新用户所选媒体消息
  const updateConfirmationMessage = (data: UserConfirmationData) => {
    userConfirmMessageRef.current = { ...userConfirmMessageRef.current, ...data };
    setUserConfirmData(prevUserConfirmData => ({ ...prevUserConfirmData, ...data }));
  };

  // 拼接媒体信息并发送
  const sendStringifyConfirmationMessage = (data: UserConfirmationData) => {
    try {
      const jsonStr = JSON.stringify(data);
      const content = `CONFIRMATION ${jsonStr}`;
      // 发送确认消息
      sendNextMessage(content);
    } catch {}
  };

  const handleMergeDescription = (newDescriptions: string, phase: string) => {
    if (!newDescriptions || !regenerationDescriptionRef.current) {
      return;
    }
    let mergedDescriptions = newDescriptions;
    const { descriptionsData, uniqueKey } = regenerationDescriptionRef.current;
    // 各个阶段处理方式不一样
    switch (phase) {
      case VideoGeneratorTaskPhase.PhaseRoleDescription: {
        const newDescriptionArray = matchRoleDescription(newDescriptions);
        const prevDescriptions = matchRoleDescription(descriptionsData[UserConfirmationDataKey.RoleDescriptions] ?? '');
        if (!prevDescriptions?.length) {
          break;
        }
        const mergedDescriptionArray = prevDescriptions.map(prevDescription => {
          if (prevDescription.uniqueKey === uniqueKey) {
            const findItem = newDescriptionArray?.find(item => item.uniqueKey === uniqueKey);
            return findItem ?? prevDescription;
          }
          return prevDescription;
        });
        const result = mergedDescriptionArray?.map(item => combinationRoleDescription(item)).join('\n');
        if (!result) {
          break;
        }
        mergedDescriptions = result;
        break;
      }
      case VideoGeneratorTaskPhase.PhaseFirstFrameDescription: {
        const newDescriptionArray = matchFirstFrameDescription(newDescriptions);
        const prevDescriptions = matchFirstFrameDescription(
          descriptionsData[UserConfirmationDataKey.FirstFrameDescriptions] ?? '',
        );
        if (!prevDescriptions?.length) {
          break;
        }
        const mergedDescriptionArray = prevDescriptions.map(prevDescription => {
          if (prevDescription.uniqueKey === uniqueKey) {
            const findItem = newDescriptionArray?.find(item => item.uniqueKey === uniqueKey);
            return findItem ?? prevDescription;
          }
          return prevDescription;
        });
        const result = mergedDescriptionArray?.map(item => combinationFirstFrameDescription(item)).join('\n');
        if (!result) {
          break;
        }
        mergedDescriptions = result;
        break;
      }
      case VideoGeneratorTaskPhase.PhaseVideoDescription: {
        const newDescriptionArray = matchVideoDescription(newDescriptions);
        const prevDescriptions = matchVideoDescription(
          descriptionsData[UserConfirmationDataKey.VideoDescriptions] ?? '',
        );
        if (!prevDescriptions?.length) {
          break;
        }
        const mergedDescriptionArray = prevDescriptions.map(prevDescription => {
          if (prevDescription.uniqueKey === uniqueKey) {
            const findItem = newDescriptionArray?.find(item => item.uniqueKey === uniqueKey);
            return findItem ?? prevDescription;
          }
          return prevDescription;
        });
        const result = mergedDescriptionArray?.map(item => combinationVideoDescription(item)).join('\n');
        if (!result) {
          break;
        }
        mergedDescriptions = result;
        break;
      }
      default: {
        break;
      }
    }
    return mergedDescriptions;
  };

  const parseOriginMessage = (
    message: BotMessage,
  ): { newMessage: VideoGeneratorBotMessage | undefined; phase: string | undefined } => {
    if (!message.versions[message.currentVersion][0].finish) {
      // 第一条为loading，如果loading未结束，视为消息未返回。需展示loading样式
      const loadingMessage: VideoGeneratorBotMessage = {
        ...message,
        type: VideoGeneratorMessageType.Loading,
        phase: undefined,
      };
      return { newMessage: loadingMessage, phase: undefined };
    }

    // 处理错误消息
    const findErrorMessage = message.versions[message.currentVersion].filter(
      version => version.type === EMessageType.Error,
    );
    if (findErrorMessage.length) {
      const errorMessage: VideoGeneratorBotMessage = {
        ...message,
        type: VideoGeneratorMessageType.Error,
        phase: undefined,
      };
      return { newMessage: errorMessage, phase: undefined };
    }

    const currentMessage = message.versions[message.currentVersion].filter(
      version => version.type === EMessageType.Message,
    )[0];
    if (!currentMessage) {
      return { newMessage: undefined, phase: undefined };
    }

    const regExp =
      /(phase=(Script|StoryBoard|RoleDescription|RoleImage|FirstFrameDescription|FirstFrameImage|VideoDescription|Video|Tone|Audio|Film))/;
    const match = currentMessage.content.match(regExp);
    if (!match) {
      // 没有匹配到阶段信息，视为普通文本消息
      const originMessage: VideoGeneratorBotMessage = {
        ...message,
        type: VideoGeneratorMessageType.Text,
        phase: undefined,
      };
      return { newMessage: originMessage, phase: undefined };
    }

    const needReplaceStr = match[1];
    const phase = match[2];

    // 除去消息文本中的阶段信息
    const cloneVersions = cloneDeep(message.versions);
    const typeMessageIndex = cloneVersions[message.currentVersion].findIndex(
      version => version.type === EMessageType.Message,
    );
    cloneVersions[message.currentVersion][typeMessageIndex].content = cloneVersions[message.currentVersion][
      typeMessageIndex
    ].content
      .replace(needReplaceStr, '')
      .trim();

    const newMessage: VideoGeneratorBotMessage = {
      ...message,
      modelDisplayInfo: message.extra?.model,
      type: VideoGeneratorMessageType.Text,
      versions: cloneVersions,
      phase: phase as VideoGeneratorTaskPhase,
    };

    // 如果是重新生成描述，需要特殊处理，将旧描述和新描述 merge
    if (
      [
        VideoGeneratorTaskPhase.PhaseRoleDescription,
        VideoGeneratorTaskPhase.PhaseFirstFrameDescription,
        VideoGeneratorTaskPhase.PhaseVideoDescription,
      ].includes(phase as VideoGeneratorTaskPhase) &&
      regenerationDescriptionRef.current &&
      cloneVersions[message.currentVersion][typeMessageIndex]
    ) {
      const mergedDescription = handleMergeDescription(
        cloneVersions[message.currentVersion][typeMessageIndex].content,
        phase,
      );
      if (mergedDescription) {
        cloneVersions[message.currentVersion][typeMessageIndex].content = mergedDescription;
      }
    }

    // 处理消息结构体
    if (phase === VideoGeneratorTaskPhase.PhaseScript || phase === VideoGeneratorTaskPhase.PhaseStoryBoard) {
      // 这些阶段返回的是简单消息
      // 简单消息是纯文本，直接转换
      return { newMessage, phase };
    } else {
      return {
        newMessage: {
          ...newMessage,
          role: 'assistant',
          type: VideoGeneratorMessageType.Multiple,
        },
        phase,
      };
    }
  };

  const getConfirmationDataByPhase = (phase: string) => {
    switch (phase) {
      case VideoGeneratorTaskPhase.PhaseRoleImage: {
        return pick(userConfirmMessageRef.current, [UserConfirmationDataKey.RoleDescriptions]);
      }
      case VideoGeneratorTaskPhase.PhaseFirstFrameDescription: {
        return pick(userConfirmMessageRef.current, [
          UserConfirmationDataKey.Script,
          UserConfirmationDataKey.StoryBoards,
          UserConfirmationDataKey.RoleDescriptions,
        ]);
      }
      case VideoGeneratorTaskPhase.PhaseFirstFrameImage: {
        return pick(userConfirmMessageRef.current, [UserConfirmationDataKey.FirstFrameDescriptions]);
      }
      case VideoGeneratorTaskPhase.PhaseVideoDescription: {
        return pick(userConfirmMessageRef.current, [
          UserConfirmationDataKey.Script,
          UserConfirmationDataKey.StoryBoards,
          UserConfirmationDataKey.RoleDescriptions,
          UserConfirmationDataKey.FirstFrameDescriptions,
        ]);
      }
      case VideoGeneratorTaskPhase.PhaseVideo: {
        return pick(userConfirmMessageRef.current, [
          UserConfirmationDataKey.VideoDescriptions,
          UserConfirmationDataKey.FirstFrameImages,
        ]);
      }
      case VideoGeneratorTaskPhase.PhaseTone: {
        return pick(userConfirmMessageRef.current, [UserConfirmationDataKey.StoryBoards]);
      }
      case VideoGeneratorTaskPhase.PhaseAudio: {
        return pick(userConfirmMessageRef.current, [UserConfirmationDataKey.Tones]);
      }
      case VideoGeneratorTaskPhase.PhaseFilm: {
        return pick(userConfirmMessageRef.current, [
          UserConfirmationDataKey.Tones,
          UserConfirmationDataKey.Videos,
          UserConfirmationDataKey.Audios,
        ]);
      }
      default: {
        break;
      }
    }
  };

  // 按阶段发送消息
  const sendUserMessageByPhase = (phase: string) => {
    const pickedData = getConfirmationDataByPhase(phase);
    if (!pickedData) {
      return;
    }
    sendStringifyConfirmationMessage(pickedData);
  };

  // 发送描述需要特殊化处理，往外抽一层
  const sendRegenerationDescription = (phase: string, newDescription: UserConfirmationData, uniqueKey: string) => {
    if (runningPhaseStatusRef.current === RunningPhaseStatus.Pending) {
      return;
    }

    const pickedData = getConfirmationDataByPhase(phase);
    const jsonText = JSON.stringify({
      ...pickedData,
      ...newDescription,
    });
    const content = `REGENERATION phase=${phase} ${jsonText}`;
    regenerationDescriptionRef.current = { descriptionsData: newDescription, uniqueKey };
    // 发送确认消息
    sendNextMessage(content);
    setEditing(true);
  };

  // 重新生成消息
  const regenerateMessageByPhase = (phase: string, data: UserConfirmationData) => {
    if (runningPhaseStatusRef.current === RunningPhaseStatus.Pending) {
      return;
    }

    const pickedData = getConfirmationDataByPhase(phase);
    if (!pickedData) {
      return;
    }
    updateConfirmationMessage(data);

    try {
      const jsonStr = JSON.stringify({ ...pickedData, ...data });
      const content = `REGENERATION phase=${phase} ${jsonStr}`;
      // 发送确认消息
      sendNextMessage(content);
      setEditing(true);
    } catch {}
  };

  const proceedNextPhase = (currentPhase: string) => {
    if (runningPhaseStatusRef.current === RunningPhaseStatus.Pending) {
      return;
    }
    const index = runOrder.findIndex(item => item === currentPhase);
    if (index === -1 || index === runOrder.length - 1) {
      return;
    }
    sendUserMessageByPhase(runOrder[index + 1]);
  };

  const onMessageFinish = (newMessage: VideoGeneratorBotMessage, phase: string) => {
    // 堆阶段
    setPhaseStack(prevPhaseStack => {
      if (prevPhaseStack.includes(phase)) {
        return prevPhaseStack;
      }
      return [...prevPhaseStack, phase];
    });

    // 清空
    regenerationDescriptionRef.current = undefined;

    const checkStatus = checkFinishMessage(newMessage, phase);

    if (checkStatus === RunningPhaseStatus.ContentError) {
      updateRunningPhaseStatus(RunningPhaseStatus.ContentError);
      updateAutoNext(false);
    } else if (phase !== VideoGeneratorTaskPhase.PhaseVideo) {
      // 更新状态
      // 视频状态另有地方更新
      updateRunningPhaseStatus(RunningPhaseStatus.Success);
    }

    // 更新用户所选的信息
    if (
      [
        VideoGeneratorTaskPhase.PhaseRoleImage,
        VideoGeneratorTaskPhase.PhaseFirstFrameImage,
        VideoGeneratorTaskPhase.PhaseVideo,
        VideoGeneratorTaskPhase.PhaseTone,
        VideoGeneratorTaskPhase.PhaseAudio,
        VideoGeneratorTaskPhase.PhaseFilm,
      ].includes(phase as VideoGeneratorTaskPhase)
    ) {
      try {
        const complexMessage = newMessage;
        const messageItem = complexMessage.versions[complexMessage.currentVersion].find(
          item => item.type === EMessageType.Message,
        );
        if (!messageItem) {
          return;
        }
        const parsedData = JSON.parse(messageItem.content);
        // 更新 ref
        updateConfirmationMessage(parsedData);
      } catch {}
    } else if (
      [
        VideoGeneratorTaskPhase.PhaseRoleDescription,
        VideoGeneratorTaskPhase.PhaseFirstFrameDescription,
        VideoGeneratorTaskPhase.PhaseVideoDescription,
      ].includes(phase as VideoGeneratorTaskPhase)
    ) {
      const complexMessage = newMessage;
      const messageItem = complexMessage.versions[complexMessage.currentVersion].find(
        item => item.type === EMessageType.Message,
      );
      if (!messageItem) {
        return;
      }
      const { content } = messageItem;
      // 按阶段，生成不同key值的数据对象
      let descriptionData;
      switch (phase) {
        case VideoGeneratorTaskPhase.PhaseRoleDescription: {
          descriptionData = { [UserConfirmationDataKey.RoleDescriptions]: content };
          break;
        }
        case VideoGeneratorTaskPhase.PhaseFirstFrameDescription: {
          descriptionData = { [UserConfirmationDataKey.FirstFrameDescriptions]: content };
          break;
        }
        case VideoGeneratorTaskPhase.PhaseVideoDescription: {
          descriptionData = { [UserConfirmationDataKey.VideoDescriptions]: content };
          break;
        }
        default: {
          break;
        }
      }
      if (descriptionData) {
        updateConfirmationMessage(descriptionData);
      }
    } else if (
      [VideoGeneratorTaskPhase.PhaseScript, VideoGeneratorTaskPhase.PhaseStoryBoard].includes(
        phase as VideoGeneratorTaskPhase,
      )
    ) {
      const botMessage = newMessage as VideoGeneratorBotMessage;
      const mainMessage = botMessage.versions[botMessage.currentVersion].find(
        item => item.type === EMessageType.Message,
      );
      if (!mainMessage) {
        return;
      }
      // 按阶段，生成不同key值的数据对象
      let data;
      switch (phase) {
        case VideoGeneratorTaskPhase.PhaseScript: {
          data = { [UserConfirmationDataKey.Script]: mainMessage.content };
          break;
        }
        case VideoGeneratorTaskPhase.PhaseStoryBoard: {
          data = { [UserConfirmationDataKey.StoryBoards]: mainMessage.content };
          break;
        }
        default: {
          break;
        }
      }
      if (data) {
        updateConfirmationMessage(data);
      }
    }

    // 发起下一次对话
    // PhaseVideo 需要轮询等待生成完成，需要手动发起下一步
    if (
      [
        VideoGeneratorTaskPhase.PhaseRoleDescription,
        VideoGeneratorTaskPhase.PhaseRoleImage,
        VideoGeneratorTaskPhase.PhaseFirstFrameDescription,
        VideoGeneratorTaskPhase.PhaseFirstFrameImage,
        VideoGeneratorTaskPhase.PhaseVideoDescription,
        VideoGeneratorTaskPhase.PhaseTone,
        VideoGeneratorTaskPhase.PhaseAudio,
      ].includes(phase as VideoGeneratorTaskPhase) &&
      autoNextRef.current
    ) {
      // 以上 phase 有自动化
      // 这些阶段，需要主动传入资源信息，进行下一步
      proceedNextPhase(phase);
    }

    // 本次生成结束
    if (phase === VideoGeneratorTaskPhase.PhaseFilm) {
      setEditing(false);
      setAutoNext(false);
      autoNextRef.current = false;
    }
  };

  const generateRenderedMessages = (messages: (UserMessage | BotMessage)[]) => {
    let newRenderedMessages: RenderedMessages = [];
    messages.forEach(message => {
      if (!message) {
        return;
      }
      if (message.role === 'user') {
        if (message.content.startsWith('REGENERATION')) {
          setEditing(true);
        }
        if ((message as UserMessage).isHidden) {
          return;
        }
        newRenderedMessages.push(message);
        return;
      }
      const { newMessage, phase } = parseOriginMessage(message);
      if (!newMessage) {
        return;
      }
      if (!phase) {
        return;
      }
      // 获取到状态信息，立即同步
      setRunningPhase(phase);

      const updateRenderedMessages = (prevRenderedMessages: RenderedMessages): RenderedMessages => {
        // 复杂消息
        if (newMessage.type === VideoGeneratorMessageType.Multiple) {
          const phaseComplexMessage = newMessage;
          // 合并消息
          if (complexMessagesRef.current[phase]) {
            // 判断是否是同一个消息
            const lastedVersions =
              complexMessagesRef.current[phase][complexMessagesRef.current[phase].length - 1].versions;
            const currentVersions = phaseComplexMessage.versions;
            if (currentVersions[0][1].id === lastedVersions[0][1].id) {
              // 覆盖
              complexMessagesRef.current = {
                ...complexMessagesRef.current,
                [phase]: [...complexMessagesRef.current[phase].slice(0, -1), phaseComplexMessage],
              };
            } else {
              // 新推一条消息
              complexMessagesRef.current = {
                ...complexMessagesRef.current,
                [phase]: [...complexMessagesRef.current[phase], phaseComplexMessage],
              };
            }
          } else {
            complexMessagesRef.current = {
              ...complexMessagesRef.current,
              [phase]: [...(complexMessagesRef.current[phase] || []), phaseComplexMessage],
            };
          }

          if (
            prevRenderedMessages[prevRenderedMessages.length - 1].type === VideoGeneratorMessageType.Loading ||
            prevRenderedMessages[prevRenderedMessages.length - 1].type === VideoGeneratorMessageType.Multiple
          ) {
            // 更新消息
            return [
              ...prevRenderedMessages.slice(0, -1),
              { role: 'assistant', type: newMessage.type, phaseMessageMap: complexMessagesRef.current },
            ];
          }

          // 新的消息
          return [
            ...prevRenderedMessages,
            { role: 'assistant', type: phaseComplexMessage.type, phaseMessageMap: complexMessagesRef.current },
          ];
        }

        // 简单消息
        if (
          prevRenderedMessages.length === 0 ||
          prevRenderedMessages[prevRenderedMessages.length - 1].role !== newMessage.role
        ) {
          // 新的消息
          return [...prevRenderedMessages, newMessage as VideoGeneratorBotMessage];
        }

        // 更新消息
        return [...prevRenderedMessages.slice(0, -1), newMessage as VideoGeneratorBotMessage];
      };
      newRenderedMessages = updateRenderedMessages(newRenderedMessages);
      if (!message.finish) {
        return;
      }
      onMessageFinish(newMessage, phase);
    });
    return newRenderedMessages;
  };

  // 重置所有状态
  const resetMessages = () => {
    // state
    setRenderedMessages([]);
    setPhaseStack([]);
    setUserConfirmData(undefined);
    resetMessage();
    // ref
    complexMessagesRef.current = {};
    userConfirmMessageRef.current = undefined;
    regenerationDescriptionRef.current = undefined;
    timerRef.current = undefined;
    // update
    updateAutoNext(false);
    updateRunningPhaseStatus(RunningPhaseStatus.Ready);
    // 媒体图片关联信息
    mediaRelevance.updateAudioBackgroundImages([]);
    mediaRelevance.updateVideoBackgroundImages([]);
    // db
    if (dbInstance) {
      try {
        dbInstance.putItem({ messages: [] });
      } catch {}
    }
  };

  const retryFromPhase = (phase: string) => {
    // 保留该阶段前的数据
    const phaseIndex = runOrder.findIndex(item => item === phase);
    if (phaseIndex === -1) {
      return;
    }
    const phaseStack = runOrder.slice(0, phaseIndex);
    const userConfirmDataKeys: UserConfirmationDataKey[] = [];
    phaseStack.forEach(item => {
      const phaseStruct = PHASE_MAP[item as VideoGeneratorTaskPhase];
      if (phaseStruct) {
        userConfirmDataKeys.push(phaseStruct.userConfirmationDataKey);
      }
    });
    // 查找原消息
    let prevMessages = [...messages];
    const phaseBotMessageIndex = messages.findIndex(item => {
      if (item.role === 'assistant') {
        if (
          item.versions[item.currentVersion].find(
            version => version.type === EMessageType.Message && version.content.startsWith(`phase=${phase}`),
          )
        ) {
          return true;
        }
      }
      return false;
    });
    if (phaseBotMessageIndex !== -1) {
      prevMessages = messages.slice(0, phaseBotMessageIndex);
    }

    // 重新设置数据
    userConfirmMessageRef.current = pick(userConfirmMessageRef.current, userConfirmDataKeys);
    complexMessagesRef.current = pick(complexMessagesRef.current, phaseStack);
    setUserConfirmData(pick(userConfirmMessageRef.current, userConfirmDataKeys));
    setPhaseStack(phaseStack);
    updateAutoNext(true);
    // 重新设置 message
    setMessages([...prevMessages]);
    if (Object.keys(complexMessagesRef.current).length === 0) {
      setRenderedMessages(prevRenderedMessages => {
        if (prevRenderedMessages[prevRenderedMessages.length - 1].type === VideoGeneratorMessageType.Multiple) {
          return [...prevRenderedMessages.slice(0, -1)];
        }
        return prevRenderedMessages;
      });
    } else {
      setRenderedMessages(prevRenderedMessages => [
        ...prevRenderedMessages.slice(0, -1),
        { role: 'assistant', type: VideoGeneratorMessageType.Multiple, phaseMessageMap: complexMessagesRef.current },
      ]);
    }
    // 重新设置媒体图片关联信息
    if (runOrder.findIndex(item => item === VideoGeneratorTaskPhase.PhaseTone) <= phaseIndex) {
      mediaRelevance.updateAudioBackgroundImages([]);
    }
    if (runOrder.findIndex(item => item === VideoGeneratorTaskPhase.PhaseVideoDescription) <= phaseIndex) {
      mediaRelevance.updateVideoBackgroundImages([]);
    }

    // 发起重试对话
    updateRunningPhaseStatus(RunningPhaseStatus.Pending);
    // 插入 bot 占位
    setTimeout(() => {
      insertBotEmptyMessage();
      // 请求接口
      startReply();
    }, 10);
  };

  const handleComplexMessageError = (message: VideoGeneratorBotMessage) => {
    const findErrorMessage = message.versions[message.currentVersion].filter(
      version => version.type === EMessageType.Error,
    );
    const errorMessage = findErrorMessage[0];
    // 处理错误
    Message.error({
      content: errorMessage.content,
      duration: 3000,
    });
    updateRunningPhaseStatus(RunningPhaseStatus.RequestError);
    // 停止自动流
    updateAutoNext(false);
  };

  // 修改描述，往 messages 里存一份，所以要伪造对话
  // 因为要考虑打字机效果，所以卡片里的 prompt 必现从 renderedMessages 里取
  const correctDescription = (phase: string, content: string) => {
    const findMessage = messages.findLast(item => {
      if (item.role === 'assistant') {
        return item.versions[item.currentVersion].find(
          version => version.type === EMessageType.Message && version.content.startsWith(`phase=${phase}`),
        );
      }
      return false;
    }) as BotMessage | undefined;
    if (!findMessage) {
      return;
    }
    // 找到引用，直接原 message 修改
    findMessage.currentVersion = findMessage.currentVersion + 1;
    findMessage.versions[findMessage.currentVersion] = [
      {
        id: Date.now(),
        type: EMessageType.Message,
        content: `phase=${phase}\n ${content}`,
        finish: true,
        logid: '',
        finish_reason: 'stop',
      },
    ];
    // 更新渲染消息
    const { newMessage: parsedMessage } = parseOriginMessage(findMessage);
    if (!parsedMessage) {
      return;
    }
    // complexMessage 中最新一条
    const complexPhaseMessage = complexMessagesRef.current[phase].pop();
    complexMessagesRef.current[phase] = [
      ...complexMessagesRef.current[phase],
      { ...complexPhaseMessage, ...parsedMessage },
    ];
    setMessages([...messages]);
    setRenderedMessages(prevRenderedMessages => [
      ...prevRenderedMessages.slice(0, -1),
      { role: 'assistant', type: VideoGeneratorMessageType.Multiple, phaseMessageMap: complexMessagesRef.current },
    ]);
  };

  // 始终是一问一答的形式，所以直接处理最后一条消息
  useEffect(() => {
    // 初始化
    if (initMessages.current) {
      const newRenderedMessages = generateRenderedMessages(messages);
      setRenderedMessages(newRenderedMessages);
      initMessages.current = false;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return;
    }
    if (lastMessage.role === 'user') {
      // 修改前面消息的isLastMessage 和 retryable
      setRenderedMessages(prevRenderedMessages => {
        const markLastAssistantMessage = (
          messages: (VideoGeneratorUserMessage | VideoGeneratorBotMessage)[],
        ): (VideoGeneratorUserMessage | VideoGeneratorBotMessage)[] => {
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
        const modifiedMessages = markLastAssistantMessage(
          prevRenderedMessages as (VideoGeneratorUserMessage | VideoGeneratorBotMessage)[],
        );
        return [...modifiedMessages];
      });
      if ((lastMessage as UserMessage).isHidden) {
        return;
      }
      setRenderedMessages(prevRenderedMessages => [...prevRenderedMessages, lastMessage]);
      return;
    }

    const { newMessage, phase } = parseOriginMessage(lastMessage);
    if (!newMessage) {
      return;
    }
    if (!phase) {
      if (Object.keys(complexMessagesRef.current).length > 0) {
        // 仅前两个阶段处理 phase = undefined 的情况
        // 如果是错误消息，特殊处理
        if (newMessage.type === VideoGeneratorMessageType.Error) {
          handleComplexMessageError(newMessage as VideoGeneratorBotMessage);
        }
        return;
      }

      const normalMessage = newMessage as VideoGeneratorBotMessage;
      // 更新状态
      if (normalMessage.type === VideoGeneratorMessageType.Error) {
        updateRunningPhaseStatus(RunningPhaseStatus.RequestError);
      } else if (normalMessage.finish) {
        updateRunningPhaseStatus(RunningPhaseStatus.Success);
      } else {
        updateRunningPhaseStatus(RunningPhaseStatus.Pending);
      }

      setRenderedMessages(prevRenderedMessages => {
        if (prevRenderedMessages.length === 0) {
          return [...prevRenderedMessages, normalMessage];
        }

        const lastRenderedMessage = prevRenderedMessages[prevRenderedMessages.length - 1];
        if (lastMessage.role === 'assistant' && lastRenderedMessage.role === 'assistant') {
          // 两边消息为assistant，视为重新生成的更新
          return [...prevRenderedMessages.slice(0, -1), normalMessage];
        }

        return [...prevRenderedMessages, normalMessage];
      });
      return;
    }

    // 获取到状态信息，立即同步
    setRunningPhase(phase);

    // 更新bot渲染消息
    setRenderedMessages(prevRenderedMessages => {
      // 复杂消息
      if (newMessage.type === VideoGeneratorMessageType.Multiple) {
        const phaseComplexMessage = newMessage;
        // 合并消息
        if (complexMessagesRef.current[phase]) {
          // 判断是否是同一个消息
          const lastedVersions =
            complexMessagesRef.current[phase][complexMessagesRef.current[phase].length - 1].versions;
          const currentVersions = phaseComplexMessage.versions;

          if (currentVersions[0][1].id === lastedVersions[0][1].id) {
            // 覆盖
            complexMessagesRef.current = {
              ...complexMessagesRef.current,
              [phase]: [...complexMessagesRef.current[phase].slice(0, -1), phaseComplexMessage],
            };
          } else {
            // 新推一条消息
            complexMessagesRef.current = {
              ...complexMessagesRef.current,
              [phase]: [...complexMessagesRef.current[phase], phaseComplexMessage],
            };
          }
        } else {
          complexMessagesRef.current = {
            ...complexMessagesRef.current,
            [phase]: [...(complexMessagesRef.current[phase] || []), phaseComplexMessage],
          };
        }

        if (
          prevRenderedMessages[prevRenderedMessages.length - 1].type === VideoGeneratorMessageType.Loading ||
          prevRenderedMessages[prevRenderedMessages.length - 1].type === VideoGeneratorMessageType.Multiple
        ) {
          // 更新消息
          return [
            ...prevRenderedMessages.slice(0, -1),
            { role: 'assistant', type: newMessage.type, phaseMessageMap: complexMessagesRef.current },
          ];
        }

        // 新的消息
        return [
          ...prevRenderedMessages,
          { role: 'assistant', type: phaseComplexMessage.type, phaseMessageMap: complexMessagesRef.current },
        ];
      }

      // 简单消息
      // 前面已经塞进过 loading 消息，所以这里直接更新即可
      return [...prevRenderedMessages.slice(0, -1), newMessage as VideoGeneratorBotMessage];
    });

    if (!lastMessage.finish) {
      return;
    }
    // 消息完成后操作
    const timer = window.setTimeout(() => {
      // finish 会重复发生，此举防止重复
      if (timer !== timerRef.current) {
        window.clearTimeout(timerRef.current);
        return;
      }
      onMessageFinish(newMessage, phase);
      try {
        // 暂存，因为useEffect的回调，无法在刷新/关闭时触发
        if (dbInstance) {
          dbInstance.putItem({ messages });
        }
      } catch {}
    }, 1000);
    timerRef.current = timer;

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [messages]);

  useEffect(() => {
    (async () => {
      if (!dbInstance) {
        return;
      }
      // 初始化
      const storeMessages = await dbInstance.getItem();
      if (storeMessages?.messages) {
        setMessages(storeMessages.messages);
        initMessages.current = true;
      }
    })();
  }, []);

  return (
    <RenderedMessagesContext.Provider
      value={{
        miniMapRef,
        renderedMessages,
        runningPhase,
        finishPhase: storePhase,
        autoNext,
        userConfirmData,
        isEditing,
        runningPhaseStatus,
        mediaRelevance,
        flowStatus,
        updateAutoNext,
        sendNextMessage,
        sendRegenerationDescription,
        proceedNextPhase,
        updateConfirmationMessage,
        regenerateMessageByPhase,
        resetMessages,
        updateRunningPhaseStatus,
        correctDescription,
        retryFromPhase,
      }}
    >
      {children}
    </RenderedMessagesContext.Provider>
  );
};

export default RenderedMessagesProvider;
