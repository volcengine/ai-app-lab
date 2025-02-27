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
import VoiceBubble, { BubbleState } from '../VoiceBubble';
const layerStyle = 'absolute left-0 top-0 h-full w-full cursor-pointer  flex flex-col items-center justify-center pt-5'; // pt-5 为了让动效居中

const UserSpeaking = () => (
  <div className={clsx(s.layer, layerStyle)}>
    <VoiceBubble state={BubbleState.RECORDING} />
    <div>{'正在听...'}</div>
  </div>
);
const BotThinking = () => (
  <div className={clsx(s.layer, layerStyle)}>
    <div className="h-[28px] w-[30px] flex items-center justify-center mb-[5px] mx-auto">
      <div className="flex gap-[6px] justify-between">
        <div className={clsx('w-3 h-3 rounded-full bg-white', s.dot)} />
        <div className={clsx('w-3 h-3 rounded-full bg-white ', s.dot)} />
        <div className={clsx('w-3 h-3 rounded-full bg-white ', s.dot)} />
      </div>
    </div>
    <div>{'正在思考'}</div>
  </div>
);
const VideoPlaying = ({ onClick }: { onClick: () => void }) => (
  <div className={clsx(s.layer, layerStyle)} onClick={onClick}>
    <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.27088 13.5056C7.27043 13.5455 7.27021 13.5854 7.27021 13.6254V23.7543C7.27021 29.4815 11.9131 34.1244 17.6403 34.1244C20.4861 34.1244 23.0642 32.9781 24.9379 31.122L7.27088 13.5056ZM28.5053 34.6792L31.2518 37.4178C28.4553 40.776 24.4063 43.079 19.8143 43.6369V45.7018C19.8143 46.7674 18.9505 47.6311 17.885 47.6311C16.8194 47.6311 15.9556 46.7674 15.9556 45.7018V43.6895C10.6157 43.189 5.96473 40.3344 3.09193 36.1842C2.48547 35.3081 2.70408 34.1062 3.58019 33.4998C4.45631 32.8933 5.65817 33.1119 6.26462 33.988C8.73658 37.5591 12.9046 39.9094 17.6408 39.9094C22.0641 39.9094 25.992 37.8593 28.5053 34.6792ZM21.503 16.4638L10.8211 5.81249C12.6441 4.22002 15.0296 3.25525 17.6403 3.25525C22.797 3.25525 27.0746 7.0191 27.8757 11.9494C27.7602 11.9431 27.6439 11.9399 27.5269 11.9399C24.67 11.9399 22.2593 13.8506 21.503 16.4638ZM27.5226 20.624C28.8545 20.624 29.9343 19.5443 29.9343 18.2123C29.9343 16.8804 28.8545 15.8007 27.5226 15.8007C26.1907 15.8007 25.111 16.8804 25.111 18.2123C25.111 19.5443 26.1907 20.624 27.5226 20.624ZM37.0331 13.4932C36.5595 12.5387 35.4018 12.1488 34.4473 12.6224C33.4928 13.0959 33.1029 14.2536 33.5765 15.2081C34.0357 16.1337 34.2799 17.1595 34.2801 18.2083C34.2803 19.4017 33.9644 20.5655 33.3755 21.5857C32.8427 22.5085 33.1589 23.6884 34.0817 24.2212C35.0045 24.7539 36.1845 24.4377 36.7172 23.5149C37.6426 21.9119 38.1391 20.0832 38.1387 18.2076C38.1385 16.5594 37.7546 14.9474 37.0331 13.4932ZM44.4082 8.86246C43.8924 7.93012 42.7184 7.59249 41.7861 8.10835C40.8537 8.6242 40.5161 9.7982 41.0319 10.7305C42.2942 13.0119 42.9644 15.5881 42.9613 18.2208C42.9582 20.9361 42.2391 23.5896 40.8935 25.9202C40.3607 26.843 40.6769 28.0229 41.5997 28.5557C42.5225 29.0884 43.7024 28.7723 44.2352 27.8495C45.9171 24.9363 46.816 21.6195 46.8199 18.2252C46.8238 14.9343 45.9861 11.7141 44.4082 8.86246Z"
        fill="white"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.61931 3.52045C1.23464 3.90512 1.23464 4.53044 1.61931 4.91511L40.6758 43.9716C41.0614 44.3572 41.6858 44.3572 42.0714 43.9716L43.4661 42.5769C43.8507 42.1912 43.8507 41.5669 43.4661 41.1822L38.8836 36.5998V36.5998L36.0854 33.8006V33.8006L33.2783 30.9945V30.9945L30.4496 28.1647V28.1647L25.4607 23.1769V23.1769L21.5154 19.2316V19.2316L17.5435 15.2587V15.2587L14.7295 12.4457V12.4457L4.40962 2.12579C4.02397 1.74013 3.39962 1.74013 3.01496 2.12579L1.61931 3.52045Z"
        fill="white"
      />
    </svg>
    <div>{'点击继续聊'}</div>
  </div>
);

export const ControlLayer = () => {
  const { state, send } = useWatchAndChatMachine();
  // eslint-disable-next-line no-nested-ternary
  return state.matches('Chat.UserSpeaking') ? (
    <UserSpeaking />
  ) : // eslint-disable-next-line no-nested-ternary
  state.matches('Chat.BotThinking') ? (
    <BotThinking />
  ) : // eslint-disable-next-line no-nested-ternary
  state.matches('VideoPlaying') ? (
    <VideoPlaying onClick={() => send({ type: 'ChatBot' })} />
  ) : null;
};
