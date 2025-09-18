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

import { createContext, RefObject } from 'react';

import {
  VideoGeneratorUserMessage,
  VideoGeneratorBotMessage,
  ComplexMessage,
  UserConfirmationData,
  RunningPhaseStatus,
  FlowStatus,
} from '../../types';

interface RenderedMessagesContextType {
  renderedMessages: (VideoGeneratorUserMessage | VideoGeneratorBotMessage | ComplexMessage)[];
  runningPhase: string; // 当前运行中的阶段
  finishPhase: string; // 当前已完成阶段
  autoNext: boolean;
  isEditing: boolean; // 是否正在编辑
  runningPhaseStatus: RunningPhaseStatus; // 阶段运行状态
  mediaRelevance: {
    videoBackgroundImages: string[][];
    audioBackgroundImages: string[][];
    updateVideoBackgroundImages: (params: ((prevData: string[][]) => string[][]) | string[][]) => void;
    updateAudioBackgroundImages: (params: ((prevData: string[][]) => string[][]) | string[][]) => void;
  };
  flowStatus: FlowStatus;
  updateAutoNext: (autoNext: boolean) => void;
  userConfirmData: UserConfirmationData | undefined; // 存放用户确定的所有数据
  sendNextMessage: (content?: string, isHidden?: boolean) => void;
  sendRegenerationDescription: (phase: string, data: UserConfirmationData, key: string) => void; // 发送重新生成描述的消息，该函数有特殊处理
  proceedNextPhase: (currentPhase: string) => void; // 继续下一个阶段
  updateConfirmationMessage: (data: UserConfirmationData) => void; // 更新用户确认的消息
  regenerateMessageByPhase: (phase: string, data: UserConfirmationData) => void; // 重新生成某一阶段的消息
  resetMessages: () => void; // 重置消息
  updateRunningPhaseStatus: (status: RunningPhaseStatus) => void; // 更新运行阶段状态，因为视频需要异步轮询完再转为钟态
  correctDescription: (phase: string, data: string) => void; // 修正描述，该函数会修改 RenderedMessages
  retryFromPhase: (phase: string) => void; // 从某个阶段开始重试
  // 引导组件示例，控制关闭
  miniMapRef: RefObject<{
    close: () => void;
  }>;
}

export const RenderedMessagesContext = createContext<RenderedMessagesContextType>({} as unknown as never);
