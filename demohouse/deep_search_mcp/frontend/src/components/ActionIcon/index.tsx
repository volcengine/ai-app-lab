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
