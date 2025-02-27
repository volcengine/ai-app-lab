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

import classNames from 'classnames';

import ColorfulButton from '../ColorfulButton';
import styles from './index.module.less';

export interface FlowItem {
  id: number | string;
  title: ReactNode;
  content?: (active: boolean) => ReactNode;
  phase: string;
}

interface Props {
  items: FlowItem[];
  current?: number; // 当前步数，从 1 开始
  onChange?: (current: number) => void;
}

const BaseFlow = (props: Props) => {
  const { items, current = 1, onChange } = props;

  return (
    <div>
      <div>
        {items.map((item, index) => {
          const isActive = current === index + 1;
          const contentNode = item.content?.(isActive);

          return (
            <div
              key={item.id}
              className={styles.flowItemContainer}
              onClick={() => {
                onChange?.(index + 1);
              }}
            >
              {index !== 0 && <div className={classNames(styles.linkLine, { [styles.linkLineActive]: isActive })} />}
              {item.title !== null && (
                <ColorfulButton mode={isActive ? 'primary' : 'default'} style={{ width: 180 }}>
                  {item.title}
                </ColorfulButton>
              )}
              {item.title !== null && contentNode && (
                <div className={classNames(styles.linkLine, { [styles.linkLineActive]: isActive })} />
              )}
              {contentNode && <div>{contentNode}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BaseFlow;
