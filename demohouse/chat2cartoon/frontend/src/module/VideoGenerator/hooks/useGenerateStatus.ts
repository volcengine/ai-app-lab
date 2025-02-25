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

import { useEffect, useRef, useState } from 'react';

import { FlowStatus, RunningPhaseStatus, VideoGeneratorBotMessage, VideoGeneratorTaskPhase } from '../types';
import { PHASE_MAP } from '../constants';

const useGenerateStatus = () => {
  const runningPhaseStatusRef = useRef<RunningPhaseStatus>(RunningPhaseStatus.Ready);
  const phasesContentErrorRef = useRef<Record<string, boolean>>({});

  const [runningPhaseStatus, setRunningPhaseStatus] = useState<RunningPhaseStatus>(RunningPhaseStatus.Ready);
  const [flowStatus, setFlowStatus] = useState<FlowStatus>(FlowStatus.Ready);

  const updateRunningPhaseStatus = (status: RunningPhaseStatus) => {
    runningPhaseStatusRef.current = status;
    setRunningPhaseStatus(status);
  };

  const checkFinishMessage = (newMessage: VideoGeneratorBotMessage, phase: string) => {
    const phaseStruct = PHASE_MAP[phase as VideoGeneratorTaskPhase];
    if (!phaseStruct) {
      return;
    }
    const { containsErrorMessage } = phaseStruct;
    if (!containsErrorMessage) {
      // 不需要检查
      return RunningPhaseStatus.Success;
    }
    // 检查是否包含错误信息
    const errorMessage = newMessage.versions[newMessage.currentVersion]?.find(item =>
      item?.content?.includes(containsErrorMessage),
    );
    if (errorMessage) {
      phasesContentErrorRef.current[phase] = true;
      return RunningPhaseStatus.ContentError;
    }
    phasesContentErrorRef.current[phase] = false;
    return RunningPhaseStatus.Success;
  };

  useEffect(() => {
    // 判断整个流能否继续运行
    let canWork = true;
    Object.keys(phasesContentErrorRef.current).forEach(key => {
      if (phasesContentErrorRef.current[key]) {
        canWork = false;
      }
    });
    setFlowStatus(canWork ? FlowStatus.Ready : FlowStatus.NotWork);
  }, [runningPhaseStatus]);

  return {
    flowStatus,
    runningPhaseStatusRef,
    runningPhaseStatus,
    updateRunningPhaseStatus,
    checkFinishMessage,
  };
};

export default useGenerateStatus;
