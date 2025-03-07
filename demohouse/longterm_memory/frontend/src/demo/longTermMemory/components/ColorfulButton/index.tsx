import { CSSProperties, PropsWithChildren } from 'react';

import cx from 'classnames';

import styles from './index.module.less';

interface Props {
  style?: CSSProperties;
  disabled?: boolean;
  className?: string;
  mode?: 'primary' | 'active' | 'default';
  onClick?: () => void;
}

const ColorfulButton = ({
  style,
  className,
  mode = 'default',
  disabled,
  children,
  onClick,
}: PropsWithChildren<Props>) => (
  <div
    className={cx(styles.button, className, {
      [styles.buttonActive]: mode === 'active',
      [styles.buttonPrimary]: mode === 'primary',
      [styles.buttonDisabled]: disabled,
    })}
    style={style}
    onClick={onClick}
  >
    {children}
  </div>
);

export default ColorfulButton;
