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


import { Button, ButtonProps, Popover } from '@arco-design/web-react';
import { IconRefresh, IconEdit } from '@arco-design/web-react/icon';

import DoubaoImg from '@/images/assets/doubao.png';

import styles from './index.module.less';
import { IconWarningFill } from '@/images/iconBox';

interface MediaCardFooterProps {
  imgUrl?: string;
  modelName?: string;
  disabled?: boolean;
  onRefresh?: () => void;
  onEdit?: () => void;
  regenerateButtonProps?: ButtonProps;
  editButtonProps?: ButtonProps;
  editWarning?: boolean;
  regenerateWarning?: boolean;
}

const MediaCardFooter = ({
  imgUrl = DoubaoImg,
  modelName = 'Doubao-pro-32k',
  disabled = false,
  onRefresh,
  onEdit,
  regenerateButtonProps,
  editButtonProps,
  editWarning,
  regenerateWarning,
}: MediaCardFooterProps) => (
  <div className={styles.footerWrapper}>
    <div className={styles.operations}>
      <Button
        disabled={disabled}
        icon={<IconRefresh style={{ fontSize: 16 }} />}
        onClick={onRefresh}
        className={styles.icon}
        {...regenerateButtonProps}
      />
      {editWarning ? (
        <Popover content={'可能需要更新'}>
          <IconWarningFill className={styles.editWarning} />
        </Popover>
      ) : null}
      <Button
        disabled={disabled}
        icon={<IconEdit style={{ fontSize: 16 }} />}
        onClick={onEdit}
        className={styles.icon}
        {...editButtonProps}
      />
      {regenerateWarning ? (
        <Popover content={'可能需要更新'}>
          <IconWarningFill className={styles.regenerateWarning} />
        </Popover>
      ) : null}
    </div>
    <div className={styles.model}>
      <img src={imgUrl} />
      <div className={styles.name}>{modelName}</div>
    </div>
  </div>
);

export default MediaCardFooter;
