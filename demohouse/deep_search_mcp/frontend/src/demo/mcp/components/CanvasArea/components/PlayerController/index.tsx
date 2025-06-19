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

import React from 'react';

import { Button, Slider } from '@arco-design/web-react';
import { IconCaretLeft, IconCaretRight } from '@arco-design/web-react/icon';

import { useChatInstance } from '@/demo/mcp/hooks/useInstance';

import styles from './index.module.less';

interface Props {
  total: number;
  current: number;
  updateCurrent: (val: number) => void;
}

const PlayerController = (props: Props) => {
  const { total, current, updateCurrent } = props;
  const { isChatting } = useChatInstance();
  return (
    <div className={styles.controllerContainer}>
      <div className={styles.btnContainer}>
        <div
          className={styles.btn}
          onClick={() => {
            if (current <= 0) {
              return;
            }
            updateCurrent(current - 1);
          }}
        >
          <IconCaretLeft className="w-[14px] h-[14px]" />
        </div>
        <div
          className={styles.btn}
          onClick={() => {
            if (current >= total) {
              return;
            }
            updateCurrent(current + 1);
          }}
        >
          <IconCaretRight className="w-[14px] h-[14px]" />
        </div>
        <div className={styles.live}>
          <svg
            className="m-1"
            xmlns="http://www.w3.org/2000/svg"
            width="6"
            height="6"
            viewBox="0 0 6 6"
            fill="none"
          >
            <circle
              cx="3"
              cy="3"
              r="3"
              fill={isChatting ? '#5CAE77' : '#737a87'}
            />
          </svg>
          <span>实时</span>
        </div>
      </div>
      <Slider
        value={current}
        onChange={val => {
          updateCurrent(val as number);
        }}
        min={0}
        max={total}
        style={{ width: '100%' }}
        tooltipVisible={false}
      />
    </div>
  );
};

export default PlayerController;
