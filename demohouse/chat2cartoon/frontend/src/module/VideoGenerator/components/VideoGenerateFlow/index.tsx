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

/* eslint-disable max-nested-callbacks */
import { useContext, useEffect, useRef, useState } from 'react';

import { cloneDeep, isUndefined } from 'lodash';
import clsx from 'classnames';
import { Modal, Popover } from '@arco-design/web-react';

import { ReactComponent as IconAiPlay } from '@/images/icon_ai_play.svg';
import { ReactComponent as IconAiPlayDisabled } from '@/images/icon_ai_play_disabled.svg';
import { ReactComponent as IconAiPause } from '@/images/icon_ai_pause.svg';
import { ReactComponent as IconAiChat } from '@/images/icon_ai_chat.svg';
import { ReactComponent as IconAiReset } from '@/images/icon_ai_reset.svg';
import { useStartChatWithVideo } from '@/module/WatchAndChat/providers/WatchAndChatProvider/hooks/useStartChatWithVideo';
import { ChatWindowContext } from '@/components/ChatWindowV2/context';
import { Assistant } from '@/types/assistant';

import {
  ComplexMessage,
  FlowPhase,
  FlowStatus,
  RunningPhaseStatus,
  UserConfirmationDataKey,
  VideoGeneratorTaskPhase,
} from '../../types';
import { useParseOriginData } from './useParseOriginData';
import { FlowData } from './types';
import BaseFlow, { FlowItem } from '../BaseFlow';
import CardScrollList from '../CardScrollList';
import MediaCard from '../MediaCard';
import MediaCardHeader from '../MediaCard/components/MediaCardHeader';
import { RenderedMessagesContext } from '../../store/RenderedMessages/context';
import ColorfulButton from '../ColorfulButton';
import VideoPlayer, { IVideoPlayerRef } from '../MediaCard/components/VideoPlayer';
import styles from './index.module.less';
import {
  matchFirstFrameDescription,
  matchRoleDescription,
  matchVideoDescription,
  mergedOriginDescriptionsByPhase,
} from '../../utils';
import FlowItemTitle from '../FlowItemTitle';
import LoadingFilm from '../LoadingFilm';
import useFlowPhaseData from './useFlowPhaseData';

interface Props {
  messages: ComplexMessage;
}

const FlowPhaseMap = [
  [VideoGeneratorTaskPhase.PhaseRoleDescription, VideoGeneratorTaskPhase.PhaseRoleImage],
  [VideoGeneratorTaskPhase.PhaseFirstFrameDescription, VideoGeneratorTaskPhase.PhaseFirstFrameImage],
  [VideoGeneratorTaskPhase.PhaseVideoDescription, VideoGeneratorTaskPhase.PhaseVideo],
  [VideoGeneratorTaskPhase.PhaseTone, VideoGeneratorTaskPhase.PhaseAudio],
  [VideoGeneratorTaskPhase.PhaseFilm],
];

const VideoGenerateFlow = (props: Props) => {
  const { messages } = props;
  const { assistantInfo } = useContext(ChatWindowContext);
  const assistantData = assistantInfo as Assistant & { Extra?: any };

  // 是否需要提示重新生成
  const [firstFrameDescriptionRegenerateState, setFirstFrameDescriptionRegenerateState] = useState<number>(0);
  const [firstFrameRegenerateState, setFirstFrameRegenerateState] = useState<number>(0);
  const [videoRegenerateState, setVideoRegenerateState] = useState<number>(0);
  const [audioRegenerateState, setAudioRegenerateState] = useState<number>(0);

  const {
    runningPhase,
    finishPhase,
    userConfirmData,
    autoNext,
    isEditing,
    runningPhaseStatus,
    mediaRelevance,
    flowStatus,
    proceedNextPhase,
    regenerateMessageByPhase,
    sendRegenerationDescription,
    updateConfirmationMessage,
    updateAutoNext,
    resetMessages,
    updateRunningPhaseStatus,
    correctDescription,
    retryFromPhase,
  } = useContext(RenderedMessagesContext);
  const { videoBackgroundImages, audioBackgroundImages, updateVideoBackgroundImages, updateAudioBackgroundImages } =
    mediaRelevance;

  const parsedOriginData = useParseOriginData(messages);
  const {
    roleDescription,
    firstFrameDescription,
    videoDescription,
    resultFilm,
  } = parsedOriginData;

  const {
    generateRolePhaseData,
    generateStoryBoardImageData,
    generateStoryBoardVideoData,
    generateStoryBoardAudioData,
  } = useFlowPhaseData(messages, parsedOriginData, assistantData);

  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);

  const [, setVideoStatus] = useState<number>(0);

  const { startChatWithVideo } = useStartChatWithVideo();

  const finalFilmPlayerRef = useRef<IVideoPlayerRef>(null);

  useEffect(() => {
    const phaseArr = [
      '',
      FlowPhase.GenerateRole,
      FlowPhase.GenerateStoryBoardImage,
      FlowPhase.GenerateStoryBoardVideo,
      FlowPhase.GenerateStoryBoardAudio,
      FlowPhase.VideoEdit,
      FlowPhase.Result,
    ];
    const phase = phaseArr[currentPhaseIndex];
    const element = document.getElementById(phase);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentPhaseIndex]);

  const modelOperateDisabled = autoNext || runningPhaseStatus === RunningPhaseStatus.Pending;

  const markFirstFrameDescriptionRegenerate = (role: string) => {
    const updateState = generateStoryBoardImageData.reduce((pre, cur, index) => {
      if (cur.role?.includes(role)) {
        return pre | (1 << index);
      }
      return pre;
    }, 0);
    setFirstFrameDescriptionRegenerateState(val => val | updateState);
  };

  const resetConfirm = () => {
    Modal.confirm({
      title: '确认清空对话吗？',
      content:
        '确认清空当前故事及生成的所有图片及音视频素材？删除后记录及素材无法找回，如有需要请先保存。',
      okText: '确认清空',
      closable: true,
      onOk: () => {
        resetMessages();
      },
    });
  };

  const renderOperationBtn = () => {
    if (finishPhase === VideoGeneratorTaskPhase.PhaseFilm && resultFilm.length > 0) {
      // 视频生成结束后的按钮事件
      if (isEditing) {
        return (
          <div className="flex gap-[10px]">
            <Popover
              disabled={flowStatus === FlowStatus.Ready}
              content={
                '当前有相关内容错误，请重新生成相关内容'
              }
            >
              <ColorfulButton
                mode="active"
                disabled={runningPhaseStatus === RunningPhaseStatus.Pending}
                style={{ width: 250 }}
              >
                <div
                  className={styles.operateWrapper}
                  onClick={() => {
                    if (runningPhaseStatus === RunningPhaseStatus.Pending) {
                      return;
                    }
                    const params = { url: '' };
                    regenerateMessageByPhase(VideoGeneratorTaskPhase.PhaseFilm, {
                      [UserConfirmationDataKey.Film]: params,
                    });
                  }}
                >
                  {runningPhaseStatus !== RunningPhaseStatus.Pending ? (
                    <IconAiPlay className={clsx(styles.operateIcon, styles.disabledIcon)} />
                  ) : (
                    <IconAiPlayDisabled className={styles.operateIcon} />
                  )}
                  <div>
                    {
                      '素材已编辑，再次生成视频'
                    }
                  </div>
                </div>
              </ColorfulButton>
            </Popover>
            <ColorfulButton mode="default" style={{ width: 130, borderWidth: 1 }}>
              <div
                className={styles.operateWrapper}
                onClick={() => {
                  resetConfirm();
                }}
              >
                <IconAiReset className={styles.operateIcon} />
                {'清空对话'}
              </div>
            </ColorfulButton>
          </div>
        );
      }

      return (
        <ColorfulButton mode="active" style={{ width: 250 }}>
          <div
            className={styles.operateWrapper}
            onClick={() => {
              resetConfirm();
            }}
          >
            <IconAiReset className={styles.operateIcon} />
            {'清空历史，开始新故事'}
          </div>
        </ColorfulButton>
      );
    }

    return (
      <>
        {autoNext ? (
          <ColorfulButton mode="active" style={{ width: 225 }}>
            <div
              className={styles.operateWrapper}
              onClick={() => {
                updateAutoNext(false);
              }}
            >
              <IconAiPause className={styles.operateIcon} />
              {'暂停后续流程'}
            </div>
          </ColorfulButton>
        ) : (
          <div className="flex gap-[10px]">
            <Popover
              disabled={flowStatus === FlowStatus.Ready}
              content={
                '当前有相关内容错误，请重新生成相关内容'
              }
            >
              <ColorfulButton mode="active" style={{ width: 225 }}>
                <div
                  onClick={() => {
                    // 点击继续，重新生成视频
                    proceedNextPhase(finishPhase);
                    updateAutoNext(true);
                  }}
                  className={styles.operateWrapper}
                >
                  <IconAiPlay className={styles.operateIcon} />
                  {'点击继续'}
                </div>
              </ColorfulButton>
            </Popover>
            <ColorfulButton mode="default" style={{ width: 130, borderWidth: 1 }}>
              <div
                className={styles.operateWrapper}
                onClick={() => {
                  resetConfirm();
                }}
              >
                <IconAiReset className={styles.operateIcon} />
                {'清空对话'}
              </div>
            </ColorfulButton>
          </div>
        )}
      </>
    );
  };

  const flowList: FlowItem[] = [
    {
      id: FlowPhase.GenerateRole,
      title: (
        <FlowItemTitle
          content={'1.生成故事角色'}
          disabled={finishPhase === VideoGeneratorTaskPhase.PhaseFilm || modelOperateDisabled}
          onRetry={retryFromPhase}
          retryPhase={VideoGeneratorTaskPhase.PhaseRoleDescription}
          finishPhase={finishPhase}
        />
      ),
      phase: FlowPhase.GenerateRole,
      content:
        generateRolePhaseData.length > 0
          ? active => {
              const roleImages = userConfirmData?.[UserConfirmationDataKey.RoleImage];

              return (
                <CardScrollList
                  id={FlowPhase.GenerateRole}
                  list={generateRolePhaseData.map((item, index) => {
                    const imageIndex = roleImages?.findIndex(item => item.index === index);

                    return (
                      <MediaCard
                        key={`${FlowPhase.GenerateRole}${index}`}
                        src={(!isUndefined(imageIndex) && roleImages?.[imageIndex]?.images?.[0]) || ''}
                        prompt={item.description}
                        header={
                          <MediaCardHeader
                            title={`
                              故事角色 ${index + 1}
                            `}
                          />
                        }
                        type="image"
                        modelInfo={item.modelDisplayInfo}
                        onEdit={val => {
                          const currentDescriptionData = roleDescription[index];
                          const storeDescriptionData = userConfirmData?.[UserConfirmationDataKey.RoleDescriptions];
                          if (!storeDescriptionData) {
                            return;
                          }
                          const matchDescriptionList = matchRoleDescription(storeDescriptionData);
                          if (!matchDescriptionList?.length) {
                            return;
                          }
                          // 合成新的描述
                          const mergedDescriptionStr = mergedOriginDescriptionsByPhase({
                            phase: VideoGeneratorTaskPhase.PhaseRoleDescription,
                            replaceDesc: val ?? '',
                            mergeList: matchDescriptionList,
                            uniqueKey: String(currentDescriptionData.key),
                          });
                          correctDescription(VideoGeneratorTaskPhase.PhaseRoleDescription, mergedDescriptionStr);
                          updateConfirmationMessage({
                            [UserConfirmationDataKey.RoleDescriptions]: mergedDescriptionStr,
                          });
                          if (generateStoryBoardImageData.length > 0) {
                            markFirstFrameDescriptionRegenerate(item.role ?? '');
                          }
                        }}
                        promptLoading={runningPhaseStatus === RunningPhaseStatus.Pending}
                        disabled={modelOperateDisabled}
                        onRegenerate={() => {
                          const roleImages = userConfirmData?.[UserConfirmationDataKey.RoleImage];
                          if (!roleImages) {
                            return;
                          }
                          const imageIndex = roleImages.findIndex(item => item.index === index);
                          if (imageIndex === -1) {
                            return;
                          }
                          // 将相应的图片置为空字符串，传给后端
                          const cloneArr = cloneDeep(roleImages);
                          cloneArr[imageIndex].images = [];
                          // 发送重新生成消息
                          regenerateMessageByPhase(VideoGeneratorTaskPhase.PhaseRoleImage, {
                            [UserConfirmationDataKey.RoleImage]: cloneArr,
                          });
                        }}
                      />
                    );
                  })}
                  isActive={active}
                />
              );
            }
          : undefined,
    },
    {
      id: FlowPhase.GenerateStoryBoardImage,
      title: (
        <FlowItemTitle
          content={'2.生成分镜画面'}
          disabled={finishPhase === VideoGeneratorTaskPhase.PhaseFilm || modelOperateDisabled}
          onRetry={retryFromPhase}
          retryPhase={VideoGeneratorTaskPhase.PhaseFirstFrameDescription}
          finishPhase={finishPhase}
        />
      ),
      phase: FlowPhase.GenerateStoryBoardImage,
      content:
        generateStoryBoardImageData.length > 0
          ? active => {
              const firstFrameImages = userConfirmData?.[UserConfirmationDataKey.FirstFrameImages];
              return (
                <CardScrollList
                  id={FlowPhase.GenerateStoryBoardImage}
                  list={generateStoryBoardImageData.map((item, index) => {
                    const firstFrameImageIndex = firstFrameImages?.findIndex(item => item.index === index);

                    return (
                      <MediaCard
                        key={`${FlowPhase.GenerateRole}${index}`}
                        src={
                          (!isUndefined(firstFrameImageIndex) &&
                            firstFrameImages?.[firstFrameImageIndex]?.images?.[0]) ||
                          ''
                        }
                        prompt={item.description}
                        disabled={modelOperateDisabled}
                        header={
                          <MediaCardHeader
                            title={`分镜画面 ${index + 1}`}
                            imgArr={generateStoryBoardImageData?.[index]?.mediaUrls}
                            currentIndex={generateStoryBoardImageData?.[index]?.mediaUrls?.findIndex(
                              item =>
                                item ===
                                  (!isUndefined(firstFrameImageIndex) &&
                                    firstFrameImages?.[firstFrameImageIndex]?.images?.[0]) || '',
                            )}
                            onSelect={val => {
                              if (isUndefined(firstFrameImageIndex) || !firstFrameImages) {
                                return;
                              }
                              const cloneArr = cloneDeep(firstFrameImages);
                              cloneArr[firstFrameImageIndex].images = [
                                generateStoryBoardImageData?.[index]?.mediaUrls?.[val],
                              ];
                              updateConfirmationMessage({
                                [UserConfirmationDataKey.FirstFrameImages]: cloneArr,
                              });
                            }}
                          />
                        }
                        type="image"
                        modelInfo={item.modelDisplayInfo}
                        editWarning={Boolean(firstFrameDescriptionRegenerateState & (1 << index))}
                        regenerateWarning={Boolean(firstFrameRegenerateState & (1 << index))}
                        onEdit={val => {
                          const currentDescriptionData = firstFrameDescription[index];
                          const storeDescriptionData =
                            userConfirmData?.[UserConfirmationDataKey.FirstFrameDescriptions];
                          if (!storeDescriptionData) {
                            return;
                          }
                          const matchDescriptionList = matchFirstFrameDescription(storeDescriptionData);
                          if (!matchDescriptionList?.length) {
                            return;
                          }
                          // 合成新的描述
                          const mergedDescriptionStr = mergedOriginDescriptionsByPhase({
                            phase: VideoGeneratorTaskPhase.PhaseFirstFrameDescription,
                            replaceDesc: val ?? '',
                            mergeList: matchDescriptionList,
                            uniqueKey: String(currentDescriptionData.key),
                          });
                          correctDescription(VideoGeneratorTaskPhase.PhaseFirstFrameDescription, mergedDescriptionStr);
                          updateConfirmationMessage({
                            [UserConfirmationDataKey.FirstFrameDescriptions]: mergedDescriptionStr,
                          });
                          setFirstFrameDescriptionRegenerateState(val => val & ~(1 << index));
                          setFirstFrameRegenerateState(val => val | (1 << index));
                        }}
                        onRegenerate={() => {
                          const firstFrameImages = userConfirmData?.[UserConfirmationDataKey.FirstFrameImages];
                          if (!firstFrameImages) {
                            return;
                          }
                          const firstFrameImageIndex = firstFrameImages.findIndex(item => item.index === index);
                          if (firstFrameImageIndex === -1) {
                            return;
                          }
                          // 将相应的图片置为空字符串，传给后端
                          const cloneArr = cloneDeep(firstFrameImages);
                          cloneArr[firstFrameImageIndex].images = [];
                          // 发送重新生成消息
                          regenerateMessageByPhase(VideoGeneratorTaskPhase.PhaseFirstFrameImage, {
                            [UserConfirmationDataKey.FirstFrameImages]: cloneArr,
                          });
                          setFirstFrameRegenerateState(val => val & ~(1 << index));
                          if (generateStoryBoardVideoData.length > 0) {
                            setVideoRegenerateState(val => val | (1 << index));
                          }
                        }}
                        promptLoading={runningPhaseStatus === RunningPhaseStatus.Pending}
                        onPromptGenerate={() => {
                          const currentDescriptionData = firstFrameDescription[index];
                          const storeDescriptionData =
                            userConfirmData?.[UserConfirmationDataKey.FirstFrameDescriptions];
                          if (!storeDescriptionData) {
                            return;
                          }
                          const matchDescriptionList = matchFirstFrameDescription(storeDescriptionData);
                          if (!matchDescriptionList?.length) {
                            return;
                          }
                          const mergedDescriptionStr = mergedOriginDescriptionsByPhase({
                            phase: VideoGeneratorTaskPhase.PhaseFirstFrameDescription,
                            replaceDesc: '',
                            mergeList: matchDescriptionList,
                            uniqueKey: String(currentDescriptionData.key),
                          });
                          sendRegenerationDescription(
                            VideoGeneratorTaskPhase.PhaseFirstFrameDescription,
                            {
                              [UserConfirmationDataKey.FirstFrameDescriptions]: mergedDescriptionStr,
                            },
                            String(currentDescriptionData.key),
                          );
                          setFirstFrameDescriptionRegenerateState(val => val & ~(1 << index));
                          setFirstFrameRegenerateState(val => val | (1 << index));
                        }}
                      />
                    );
                  })}
                  isActive={active}
                />
              );
            }
          : undefined,
    },
    {
      id: FlowPhase.GenerateStoryBoardVideo,
      title: (
        <FlowItemTitle
          content={'3.生成分镜视频'}
          disabled={finishPhase === VideoGeneratorTaskPhase.PhaseFilm || modelOperateDisabled}
          onRetry={retryFromPhase}
          retryPhase={VideoGeneratorTaskPhase.PhaseVideoDescription}
          finishPhase={finishPhase}
        />
      ),
      phase: FlowPhase.GenerateStoryBoardVideo,
      content:
        generateStoryBoardVideoData.length > 0
          ? active => {
              const videos = userConfirmData?.[UserConfirmationDataKey.Videos];
              const firstFrameImages = userConfirmData?.[UserConfirmationDataKey.FirstFrameImages];

              return (
                <CardScrollList
                  id={FlowPhase.GenerateStoryBoardVideo}
                  list={generateStoryBoardVideoData.map((item, index) => {
                    const videoIndex = videos?.findIndex(item => item.index === index);
                    const firstImageIndex = firstFrameImages?.findIndex(item => item.index === index);

                    if (!isUndefined(firstImageIndex) && firstFrameImages?.[firstImageIndex]?.images?.[0]) {
                      if (!(index in videoBackgroundImages)) {
                        updateVideoBackgroundImages(val => ({
                          ...val,
                          [index]: [firstFrameImages?.[firstImageIndex]?.images?.[0]],
                        }));
                        videoBackgroundImages[index] = [firstFrameImages?.[firstImageIndex]?.images?.[0]];
                      }
                    }

                    return (
                      <MediaCard
                        key={`${FlowPhase.GenerateStoryBoardVideo}${index}`}
                        src={(!isUndefined(videoIndex) && videos?.[videoIndex]?.content_generation_task_id) || ''}
                        prompt={item.description}
                        disabled={modelOperateDisabled}
                        header={
                          <MediaCardHeader
                            title={`
                              视频画面 ${index + 1}
                            `}
                            imgArr={videoBackgroundImages?.[index]}
                            currentIndex={generateStoryBoardVideoData?.[index]?.mediaIds?.findIndex(
                              item =>
                                item === (!isUndefined(videoIndex) && videos?.[videoIndex]?.content_generation_task_id) || '',
                            )}
                            onSelect={val => {
                              if (isUndefined(videoIndex) || !videos) {
                                return;
                              }
                              const cloneArr = cloneDeep(videos);
                              cloneArr[videoIndex].content_generation_task_id =
                                generateStoryBoardVideoData?.[index]?.mediaIds?.[val];
                              updateConfirmationMessage({
                                [UserConfirmationDataKey.Videos]: cloneArr,
                              });
                            }}
                          />
                        }
                        type="video"
                        modelInfo={item.modelDisplayInfo}
                        afterLoad={() => {
                          setVideoStatus(status => {
                            if ((status | (1 << index)) === (1 << generateStoryBoardVideoData.length) - 1 && runningPhase === VideoGeneratorTaskPhase.PhaseVideo) {
                              // 阶段转终态
                              updateRunningPhaseStatus(RunningPhaseStatus.Success);
                              if (autoNext) {
                                // 视频全部加载完毕，进入下一步
                                proceedNextPhase(finishPhase);
                              }
                            }
                            return status | (1 << index);
                          });
                        }}
                        audioImg={isUndefined(firstImageIndex) ? '' : firstFrameImages?.[firstImageIndex]?.images?.[0]}
                        onEdit={val => {
                          const currentDescriptionData = videoDescription[index];
                          const storeDescriptionData = userConfirmData?.[UserConfirmationDataKey.VideoDescriptions];
                          if (!storeDescriptionData) {
                            return;
                          }
                          const matchDescriptionList = matchVideoDescription(storeDescriptionData);
                          if (!matchDescriptionList?.length) {
                            return;
                          }
                          // 合成新的描述
                          const mergedDescriptionStr = mergedOriginDescriptionsByPhase({
                            phase: VideoGeneratorTaskPhase.PhaseVideoDescription,
                            replaceDesc: val ?? '',
                            mergeList: matchDescriptionList,
                            uniqueKey: String(currentDescriptionData.key),
                          });
                          correctDescription(VideoGeneratorTaskPhase.PhaseVideoDescription, mergedDescriptionStr);
                          updateConfirmationMessage({
                            [UserConfirmationDataKey.VideoDescriptions]: mergedDescriptionStr,
                          });
                          setVideoRegenerateState(val => val | (1 << index));
                        }}
                        regenerateWarning={Boolean(videoRegenerateState & (1 << index))}
                        onRegenerate={() => {
                          const videoIds = userConfirmData?.[UserConfirmationDataKey.Videos];
                          if (!videoIds) {
                            return;
                          }
                          const videoIndex = videoIds.findIndex(item => item.index === index);
                          if (videoIndex === -1) {
                            return;
                          }
                          // 将相应的图片置为空字符串，传给后端
                          const cloneArr = cloneDeep(videoIds);
                          cloneArr[videoIndex].content_generation_task_id = '';
                          // 发送重新生成消息
                          regenerateMessageByPhase(VideoGeneratorTaskPhase.PhaseVideo, {
                            [UserConfirmationDataKey.Videos]: cloneArr,
                          });
                          setVideoStatus(status => status & ~(1 << videoIndex));
                          updateVideoBackgroundImages(val => {
                            const cloneArr = cloneDeep(val);
                            cloneArr[index].push(
                              isUndefined(firstImageIndex) ? '' : firstFrameImages?.[firstImageIndex]?.images?.[0],
                            );
                            return cloneArr;
                          });
                          setVideoRegenerateState(val => val & ~(1 << index));
                        }}
                        promptLoading={runningPhaseStatus === RunningPhaseStatus.Pending}
                        onPromptGenerate={() => {
                          const currentDescriptionData = videoDescription[index];
                          const storeDescriptionData = userConfirmData?.[UserConfirmationDataKey.VideoDescriptions];
                          if (!storeDescriptionData) {
                            return;
                          }
                          const matchDescriptionList = matchVideoDescription(storeDescriptionData);
                          if (!matchDescriptionList?.length) {
                            return;
                          }
                          const mergedDescriptionStr = mergedOriginDescriptionsByPhase({
                            phase: VideoGeneratorTaskPhase.PhaseVideoDescription,
                            replaceDesc: '',
                            mergeList: matchDescriptionList,
                            uniqueKey: String(currentDescriptionData.key),
                          });
                          sendRegenerationDescription(
                            VideoGeneratorTaskPhase.PhaseVideoDescription,
                            {
                              [UserConfirmationDataKey.VideoDescriptions]: mergedDescriptionStr,
                            },
                            String(currentDescriptionData.key),
                          );
                          setVideoRegenerateState(val => val | (1 << index));
                        }}
                      />
                    );
                  })}
                  isActive={active}
                />
              );
            }
          : undefined,
    },
    {
      id: FlowPhase.GenerateStoryBoardAudio,
      title: (
        <FlowItemTitle
          content={'4.生成分镜配音'}
          disabled={finishPhase === VideoGeneratorTaskPhase.PhaseFilm || modelOperateDisabled}
          onRetry={retryFromPhase}
          retryPhase={VideoGeneratorTaskPhase.PhaseTone}
          finishPhase={finishPhase}
        />
      ),
      phase: FlowPhase.GenerateStoryBoardAudio,
      content:
        generateStoryBoardAudioData.length > 0
          ? active => {
              const audios = userConfirmData?.[UserConfirmationDataKey.Audios];
              const firstFrameImages = userConfirmData?.[UserConfirmationDataKey.FirstFrameImages];

              return (
                <CardScrollList
                  id={FlowPhase.GenerateStoryBoardAudio}
                  list={generateStoryBoardAudioData.map((item, index) => {
                    const audioIndex = audios?.findIndex(item => item.index === index);
                    const firstImageIndex = firstFrameImages?.findIndex(item => item.index === index);

                    if (!isUndefined(firstImageIndex) && firstFrameImages?.[firstImageIndex]?.images?.[0]) {
                      if (!(index in audioBackgroundImages)) {
                        updateAudioBackgroundImages(val => ({
                          ...val,
                          [index]: [firstFrameImages?.[firstImageIndex]?.images?.[0]],
                        }));
                        audioBackgroundImages[index] = [firstFrameImages?.[firstImageIndex]?.images?.[0]];
                      }
                    }

                    return (
                      <MediaCard
                        key={`${FlowPhase.GenerateStoryBoardAudio}${index}`}
                        src={(!isUndefined(audioIndex) && audios?.[audioIndex]?.url) || ''}
                        prompt={item.description}
                        disabled={modelOperateDisabled}
                        tone={item.tone}
                        regenerateWarning={Boolean(audioRegenerateState & (1 << index))}
                        header={
                          <MediaCardHeader
                            title={`
                              分镜配音 ${index + 1}
                            `}
                            imgArr={audioBackgroundImages?.[index]}
                            currentIndex={generateStoryBoardAudioData?.[index]?.mediaUrls?.findIndex(
                              item => item === (!isUndefined(audioIndex) && audios?.[audioIndex]?.url) || '',
                            )}
                            onSelect={val => {
                              if (isUndefined(audioIndex) || !audios) {
                                return;
                              }
                              const cloneArr = cloneDeep(audios);
                              cloneArr[audioIndex].url = generateStoryBoardAudioData?.[index]?.mediaUrls?.[val];
                              // 发送重新生成消息
                              updateConfirmationMessage({
                                [UserConfirmationDataKey.Audios]: cloneArr,
                              });
                            }}
                          />
                        }
                        audioImg={generateStoryBoardImageData[index]?.mediaUrls?.[0]}
                        type="audio"
                        modelInfo={item.modelDisplayInfo}
                        onRegenerate={() => {
                          const audios = userConfirmData?.[UserConfirmationDataKey.Audios];
                          if (!audios) {
                            return;
                          }
                          const audioIndex = audios.findIndex(item => item.index === index);
                          if (audioIndex === -1) {
                            return;
                          }
                          const cloneArr = cloneDeep(audios);
                          cloneArr[audioIndex].url = '';
                          // 发送重新生成消息
                          regenerateMessageByPhase(VideoGeneratorTaskPhase.PhaseAudio, {
                            [UserConfirmationDataKey.Audios]: cloneArr,
                          });
                          updateAudioBackgroundImages(val => {
                            const cloneArr = cloneDeep(val);
                            cloneArr[index].push(
                              isUndefined(firstImageIndex) ? '' : firstFrameImages?.[firstImageIndex]?.images?.[0],
                            );
                            return cloneArr;
                          });
                          setAudioRegenerateState(status => status & ~(1 << index));
                        }}
                        onEdit={(val, tone) => {
                          const tones = userConfirmData?.[UserConfirmationDataKey.Tones];
                          if (!tones) {
                            return;
                          }
                          const toneIndex = tones?.findIndex(item => item.index === index);
                          if (toneIndex === -1) {
                            return;
                          }
                          const cloneArr = cloneDeep(tones);
                          cloneArr[toneIndex].line = val;
                          if (tone) {
                            cloneArr[toneIndex].tone = tone;
                          }
                          correctDescription(
                            VideoGeneratorTaskPhase.PhaseTone,
                            JSON.stringify({ [UserConfirmationDataKey.Tones]: cloneArr }),
                          );
                          updateConfirmationMessage({
                            [UserConfirmationDataKey.Tones]: cloneArr,
                          });
                          setAudioRegenerateState(val => val | (1 << index));
                        }}
                        promptLoading={runningPhaseStatus === RunningPhaseStatus.Pending}
                        onPromptGenerate={() => {
                          const tones = userConfirmData?.[UserConfirmationDataKey.Tones];
                          if (!tones) {
                            return;
                          }
                          const toneIndex = tones?.findIndex(item => item.index === index);
                          if (toneIndex === -1) {
                            return;
                          }
                          const cloneArr = cloneDeep(tones);
                          cloneArr[toneIndex].line = '';
                          // 发送重新生成消息
                          sendRegenerationDescription(
                            VideoGeneratorTaskPhase.PhaseTone,
                            {
                              [UserConfirmationDataKey.Tones]: cloneArr,
                            },
                            String(tones[toneIndex].key),
                          );
                        }}
                      />
                    );
                  })}
                  isActive={active}
                />
              );
            }
          : undefined,
    },
    // resultFilm 操控两个步骤，第5步是loading，第6步是展示视频
    // 这里的逻辑是，当视频生成完，进入第6步，否则进入第5步
    {
      id: FlowPhase.VideoEdit,
      title: null,
      phase: FlowPhase.VideoEdit,
      content: active => (
        <ColorfulButton style={{ width: 180 }} mode={active ? 'active' : 'default'}>
          <div id={FlowPhase.VideoEdit}>
            {runningPhase === VideoGeneratorTaskPhase.PhaseFilm && runningPhaseStatus !== RunningPhaseStatus.Success ? (
              <LoadingFilm runningPhaseStatus={runningPhaseStatus} />
            ) : (
              '5.视频剪辑'
            )}
          </div>
        </ColorfulButton>
      ),
    },
    {
      id: FlowPhase.Result,
      title: '6.最终视频',
      phase: FlowPhase.Result,
      content: () => {
        if (!userConfirmData?.film?.url) {
          return null;
        }

        return (
          <div id={FlowPhase.Result} className={styles.videoChatWrapper}>
            <div className={styles.videoWrapper}>
              <div className={styles.videoBorder}>
                <VideoPlayer ref={finalFilmPlayerRef} videoLink={userConfirmData?.film?.url || ''} />
              </div>
            </div>
            <ColorfulButton
              mode="active"
              style={{ width: 225 }}
              onClick={() => {
                finalFilmPlayerRef.current?.pause();
                startChatWithVideo({
                  videoUrl: userConfirmData?.film?.url || '',
                  // userConfirmData?.videos?.at(-1)||'',
                  confirmation: JSON.stringify({
                    [UserConfirmationDataKey.Script]: userConfirmData?.script,
                    [UserConfirmationDataKey.StoryBoards]: userConfirmData?.storyboards,
                    [UserConfirmationDataKey.RoleDescriptions]: userConfirmData?.role_descriptions,
                  }),
                });
              }}
            >
              <div className={styles.operateWrapper}>
                <IconAiChat className={styles.operateIcon} />
                {'边看边聊'}
              </div>
            </ColorfulButton>
          </div>
        );
      },
    },
  ];

  useEffect(() => {
    if (!runningPhase) {
      return;
    }
    // 映射 phase 到当前第几步
    const index = FlowPhaseMap.findIndex(item => item.includes(runningPhase as VideoGeneratorTaskPhase));
    setCurrentPhaseIndex(index === -1 ? 0 : index + 1);
  }, [runningPhase]);

  useEffect(() => {
    // 如果视频生成完，进入第6步
    if (runningPhase === VideoGeneratorTaskPhase.PhaseFilm && runningPhaseStatus === RunningPhaseStatus.Success) {
      setCurrentPhaseIndex(6);
    }
  }, [runningPhaseStatus]);

  return (
    <>
      <div className={styles['base-flow-wrapper']}>
        <BaseFlow items={flowList} current={currentPhaseIndex} />
      </div>
      <div className={styles.operateButton}>{renderOperationBtn()}</div>
    </>
  );
};

export default VideoGenerateFlow;
