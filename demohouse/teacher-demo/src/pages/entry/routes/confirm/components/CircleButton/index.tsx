import React, { CSSProperties, ReactNode } from 'react';

import styles from './index.module.less';

interface CircleButtonProps {
  size?: number;
  style?: CSSProperties;
  icon: ReactNode;
  onClick?: () => void;
}

export const CircleButton: React.FC<CircleButtonProps> = ({ size = 48, style, icon: Icon, onClick }) => (
  <div className={styles.btnContainer} style={{ width: size, height: size, ...style }} onClick={onClick}>
    {Icon}
  </div>
);
