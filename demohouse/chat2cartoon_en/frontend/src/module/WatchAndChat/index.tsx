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

import { useContext, useEffect } from 'react';

import { useSpring, animated } from '@react-spring/web';

import { BotAvatar } from './components/BotAvatar';
import { NoAccessAlert } from './components/NoAccessAlert';
import { VideoPlayer } from './components/VideoPlayer';
import { MachineContext } from './providers/MachineProvider/context';
import { useStartChatWithVideo } from './providers/WatchAndChatProvider/hooks/useStartChatWithVideo';
import { IconClose } from './images/IconClose';

export const WatchAndChat = () => {
  const { send, state } = useContext(MachineContext);
  const { visible, stopChatWithVideo } = useStartChatWithVideo();

  const animationProps = useSpring({
    opacity: visible ? 1 : 0,
    transform: visible ? 'scale(1)' : 'scale(0.8)',
    zIndex: visible ? 100 : 0,
    from: { opacity: 0, transform: 'scale(0.8)', zIndex: 0 },
    config: { duration: 300 },
    onRest: () => {
      if (!visible) {
        send({ type: 'EXIT' });
      }
    },
  });

  useEffect(() => {
    if (visible) {
      send({ type: 'INIT' });
    }
    return () => {
      send({ type: 'EXIT' });
    };
  }, [visible]);

  return visible ? (
    <animated.div style={animationProps} className="w-full h-full absolute relative">
      <IconClose
        className="absolute right-5 top-5 z-20"
        onClick={() => {
          stopChatWithVideo();
        }}
      />
      {state.matches('NO_ACCESS') && <NoAccessAlert />}
      <VideoPlayer />
      <BotAvatar />
    </animated.div>
  ) : null;
};
