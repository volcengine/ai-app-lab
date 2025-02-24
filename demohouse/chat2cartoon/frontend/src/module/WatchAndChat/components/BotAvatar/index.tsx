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

import clsx from 'classnames';

import s from './index.module.less';
import { useWatchAndChatMachine } from '../../providers/MachineProvider/useWatchAndChatMachine';
import { AudioVisualizer } from './AudioVisualizer';
import { ControlLayer } from './ControlLayer';

export const BotAvatar = () => {
  const { state } = useWatchAndChatMachine();
  const videoSrc =
    'https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/bot/watch_and_chat_demo/speaking.mp4';
  return (
    <div className={clsx('absolute right-[38px] bottom-[196px]', state.matches('NO_ACCESS') && 'cursor-not-allowed')}>
      {state.matches('BotWelcome') || state.matches('Chat.BotSpeaking') ? (
        <video src={videoSrc} autoPlay className={clsx(s.avatar, 'object-cover')} muted loop />
      ) : (
        <img
          className={s.avatar}
          src="https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/bot/watch_and_chat_demo/avatar.png"
        />
      )}

      <AudioVisualizer />
      <ControlLayer />
    </div>
  );
};
