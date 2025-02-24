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

import { type FC, useContext } from 'react';

import classNames from 'classnames';

import s from './index.module.less';
import { WatchAndChatContext } from '../../providers/WatchAndChatProvider/context';

export enum BubbleTheme {
  BORDERLESS = 'borderless',
  LIGHT = 'light',
}
export enum BubbleState {
  RECORDING = 'recording',
}
export enum BubbleSize {
  SMALL = 'small',
  DEFAULT = 'default',
}

export interface VoiceBubbleProps {
  theme?: BubbleTheme;
  state: BubbleState;
  size?: BubbleSize;
  color?: string;
}
const VoiceBubble: FC<VoiceBubbleProps> = ({
  theme = BubbleTheme.LIGHT,
  state,
  size = BubbleSize.DEFAULT,
  color = '#fff',
}) => {
  const { userAudioWaveHeights } = useContext(WatchAndChatContext);
  return (
    <div className="flex flex-col justify-center items-center gap-[6px]">
      <div className={s.answerBubbleContent}>
        {Object.keys(userAudioWaveHeights).map((key, index) => (
          <div
            key={`bar-${index}`}
            className={classNames(s.bubbleBar, size === BubbleSize.SMALL && `${s.bubbleBarSmall} `)}
            style={{
              height: `${userAudioWaveHeights[key as keyof typeof userAudioWaveHeights]}px`,
              backgroundColor: color,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default VoiceBubble;
