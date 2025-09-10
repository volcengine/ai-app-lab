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

import { FC, PropsWithChildren } from 'react';

import cx from 'classnames';
import { Tooltip } from '@arco-design/web-react';

import style from './style.module.less';

interface Props {
  className?: string;
  popoverStyle?: boolean;
  tips?: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export const ActionIcon: FC<PropsWithChildren<Props>> = props => {
  const { className, popoverStyle = false, children, tips, onClick, isActive, disabled } = props;

  return (
    <Tooltip prefixCls={popoverStyle ? 'arco-popover' : undefined} disabled={!tips} content={tips}>
      <span
        className={cx(
          style.actionIcon,
          {
            [style.activeIcon]: isActive,
            [style.disabledIcon]: disabled,
          },
          !disabled && 'hover:bg-[#F6F8FA] active:bg-[#F1F3F5]',
          className,
        )}
        onClick={() => {
          if (!disabled) {
            onClick?.();
          }
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
};
