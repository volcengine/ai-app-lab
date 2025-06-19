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

import { CSSProperties, PropsWithChildren } from 'react';

import { IconClose } from '@/images/deepResearch';

import styles from './index.module.less';

interface Props {
  title: string | React.ReactNode;
  simple?: boolean;
  onClose: () => void;
  style?: CSSProperties;
}

const CommonPanel = (props: PropsWithChildren<Props>) => {
  const { title, children, onClose, style, simple } = props;

  return (
    <div className={styles.drawer} style={style}>
      <header className={styles.header} style={{ borderBottomWidth: simple ? '0px' : '1px' }}>
        <div className={styles.text}>{title}</div>
        <IconClose className={styles.iconClose} onClick={onClose} />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
};

export default CommonPanel;
