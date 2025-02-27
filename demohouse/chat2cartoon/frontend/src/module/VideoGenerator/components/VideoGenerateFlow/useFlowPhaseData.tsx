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

import { useMemo } from 'react';
import { ParsedData } from './useParseOriginData';
import { ComplexMessage, VideoGeneratorTaskPhase } from '../../types';
import { isUndefined } from 'lodash';
import { FlowData } from './types';
import { Assistant } from '@/types/assistant';

const useFlowPhaseData = (messages: ComplexMessage, parsedOriginData: ParsedData, assistantData: Assistant) => {
  const {
    roleDescription,
    roleImage,
    firstFrameDescription,
    firstFrameImage,
    videoDescription,
    storyboardVideo,
    audioTones,
    storyboardAudio,
  } = parsedOriginData;

  const generateRolePhaseData = useMemo(() => {
    const textModelInfo = messages.phaseMessageMap[VideoGeneratorTaskPhase.PhaseRoleDescription]?.[0]?.modelDisplayInfo;
    // 这个都还没有，说明未进行到该阶段
    if (isUndefined(textModelInfo)) {
      return [];
    }

    const modelDisplayInfo = assistantData.Extra.Models.find((item: any) => {
      if (Array.isArray(item.Used)) {
        return item.Used.includes(VideoGeneratorTaskPhase.PhaseRoleImage);
      }
      return false;
    });
    const basicData: FlowData = {
      description: '',
      modelDisplayInfo: {
        modelName: modelDisplayInfo?.ModelName,
        imgSrc: modelDisplayInfo?.Icon,
        displayName: modelDisplayInfo?.Name,
      },
    };
    if (roleDescription.length === 0) {
      return [basicData];
    }
    const result = roleDescription.map((item, index) => ({
      ...basicData,
      description: item.versions[item.versions.length - 1], // 永远取到最新的版本
      mediaUrls: roleImage[index]?.versions,
      role: item.extra.storyRole,
    }));
    return result as FlowData[];
  }, [roleDescription, roleImage]);

  const generateStoryBoardImageData = useMemo(() => {
    const textModelInfo =
      messages.phaseMessageMap[VideoGeneratorTaskPhase.PhaseFirstFrameDescription]?.[0]?.modelDisplayInfo;
    // 这个都还没有，说明未进行到该阶段
    if (isUndefined(textModelInfo)) {
      return [];
    }

    const modelDisplayInfo = assistantData.Extra.Models.find((item: any) => {
      if (Array.isArray(item.Used)) {
        return item.Used.includes(VideoGeneratorTaskPhase.PhaseFirstFrameImage);
      }
      return false;
    });
    const basicData: FlowData = {
      description: '',
      modelDisplayInfo: {
        modelName: modelDisplayInfo?.ModelName,
        imgSrc: modelDisplayInfo?.Icon,
        displayName: modelDisplayInfo?.Name,
      },
    };
    if (firstFrameDescription.length === 0) {
      return [basicData];
    }
    const result = firstFrameDescription.map((item, index) => ({
      ...basicData,
      description: item.versions[item.versions.length - 1],
      mediaUrls: firstFrameImage[index]?.versions,
      role: item.extra.storyRole,
    }));
    return result as FlowData[];
  }, [firstFrameDescription, firstFrameImage]);

  const generateStoryBoardVideoData = useMemo(() => {
    const textModelInfo =
      messages.phaseMessageMap[VideoGeneratorTaskPhase.PhaseVideoDescription]?.[0]?.modelDisplayInfo;
    // 这个都还没有，说明未进行到该阶段
    if (isUndefined(textModelInfo)) {
      return [];
    }

    const modelDisplayInfo = assistantData.Extra.Models.find((item: any) => {
      if (Array.isArray(item.Used)) {
        return item.Used.includes(VideoGeneratorTaskPhase.PhaseVideo);
      }
      return false;
    });
    const basicData: FlowData = {
      description: '',
      modelDisplayInfo: {
        modelName: modelDisplayInfo?.ModelName,
        imgSrc: modelDisplayInfo?.Icon,
        displayName: modelDisplayInfo?.Name,
      },
    };
    if (videoDescription.length === 0) {
      return [basicData];
    }
    const result = videoDescription.map((item, index) => ({
      ...basicData,
      description: item.versions[item.versions.length - 1],
      mediaIds: storyboardVideo[index]?.versions,
    }));
    return result;
  }, [videoDescription, storyboardVideo]);

  const generateStoryBoardAudioData = useMemo(() => {
    const audioModelText = messages.phaseMessageMap[VideoGeneratorTaskPhase.PhaseTone]?.[0]?.modelDisplayInfo;
    if (isUndefined(audioModelText)) {
      return [];
    }

    const modelDisplayInfo = assistantData.Extra.Models.find((item: any) => {
      if (Array.isArray(item.Used)) {
        return item.Used.includes(VideoGeneratorTaskPhase.PhaseAudio);
      }
      return false;
    });
    const basicData: FlowData = {
      description: '',
      modelDisplayInfo: {
        modelName: modelDisplayInfo?.ModelName,
        imgSrc: modelDisplayInfo?.Icon,
        displayName: modelDisplayInfo?.Name,
      },
    };
    if (audioTones.length === 0) {
      return [basicData];
    }

    const result = audioTones.map((item, index) => ({
      ...basicData,
      description: item.versions[item.versions.length - 1].line,
      tone: item.versions[item.versions.length - 1].tone,
      mediaUrls: storyboardAudio[index]?.versions,
    }));
    return result;
  }, [audioTones, storyboardAudio]);

  return {
    generateRolePhaseData,
    generateStoryBoardImageData,
    generateStoryBoardVideoData,
    generateStoryBoardAudioData,
  };
};

export default useFlowPhaseData;
