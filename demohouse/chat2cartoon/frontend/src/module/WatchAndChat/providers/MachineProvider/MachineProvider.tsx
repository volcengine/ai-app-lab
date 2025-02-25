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

import { FC, PropsWithChildren } from 'react';

import { useMachine } from '@xstate/react';

import { watchAndChatMachine } from '../../machines/watchAndChatMachine';
import { MachineContext } from './context';
import { useAudioInput } from './hooks/useAudioInput';
import { useBotAudioOperate } from './hooks/useBotAudioOperate';
import { useBotChatCompletion } from './hooks/useBotChatCompletion';
import { useCaptureFrame } from './hooks/useCaptureFrame';
import { useGetUserMedia } from './hooks/useGetUserMedia';
import { usePlayBotOpeningRemark } from './hooks/usePlayBotOpeningRemark';
import { useVideoOperate } from './hooks/useVideoOperate';

export const MachineProvider: FC<PropsWithChildren<{ url: string }>> = ({ children, url }) => {
  const { getUserMedia, releaseMedia } = useGetUserMedia();
  const playBotOpeningRemark = usePlayBotOpeningRemark();
  const { loadVideo, playVideo, pauseVideo } = useVideoOperate();
  const { recognizeUserAudioText, stopRecord } = useAudioInput();
  const captureFrame = useCaptureFrame();
  const botChatCompletion = useBotChatCompletion(url);
  const { playBotAudio, stopBotAudio, updateAudioData, markAudioDataFinished } = useBotAudioOperate();
  const [state, send] = useMachine(watchAndChatMachine, {
    services: {
      getUserMedia,
      playBotOpeningRemark,
      recognizeUserAudioText,
      botChatCompletion,
      playBotAudio,
    },
    actions: {
      releaseMedia,
      loadVideo,
      playVideo,
      pauseVideo,
      captureFrame,
      stopRecord,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      updateAudioData,
      markAudioDataFinished,
      stopBotAudio,
    },
  });

  return (
    <MachineContext.Provider
      value={{
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        state,
        send,
        machine: watchAndChatMachine,
      }}
    >
      {children}
    </MachineContext.Provider>
  );
};
