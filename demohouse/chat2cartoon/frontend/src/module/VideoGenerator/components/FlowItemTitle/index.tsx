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


import { ReactNode } from 'react';

import { Popover } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';

import styles from './index.module.less';
import { VideoGeneratorTaskPhase } from '../../types';

interface Props {
  content: ReactNode;
  disabled: boolean;
  retryPhase: string;
  finishPhase: string;
  onRetry: (phase: string) => void;
}

const runOrder = Object.values(VideoGeneratorTaskPhase);

const FlowItemTitle = (props: Props) => {
  const { content, onRetry, disabled, retryPhase, finishPhase } = props;

  const handleRetry = () => {
    onRetry(retryPhase);
  };

  const isDisabled =
    disabled || runOrder.findIndex(item => item === finishPhase) < runOrder.findIndex(item => item === retryPhase);

  return (
    <div className={styles.flowItemTitleContainer}>
      <div>{content}</div>
      {!isDisabled && (
        <Popover content={'从当前阶段开始重新生成'}>
          <div className={styles.icon} onClick={handleRetry}>
            <IconRefresh />
          </div>
        </Popover>
      )}
    </div>
  );
};

export default FlowItemTitle;
