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

import cx from 'classnames';

import styles from './index.module.less';

interface IProps {
  isLoading: boolean;
  icon: ReactNode;
  text: ReactNode;
  extra?: ReactNode;
  loadingExtra?: ReactNode;
}

export function AnimatedSubtitle(props: IProps) {
  const { isLoading, icon, text, extra, loadingExtra } = props;

  return (
    <div className={cx('flex items-center gap-[6px]', { [styles.isLoading]: isLoading })}>
      {isLoading && (
        <div className="relative ml-[4px]">
          <div className={styles.dot} />
          <div className={styles.dotBreath}></div>
        </div>
      )}
      {!isLoading && icon}
      <div className={styles.text}>{text}</div>
      {isLoading && loadingExtra}
      {!isLoading && extra}
    </div>
  );
}
