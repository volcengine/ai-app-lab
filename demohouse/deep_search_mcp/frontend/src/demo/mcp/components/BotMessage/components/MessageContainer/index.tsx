import { PropsWithChildren, ReactNode } from 'react';

import styles from './index.module.less';

interface Props {
  footer?: ReactNode;
}

const MessageContainer = (props: PropsWithChildren<Props>) => {
  const { children, footer } = props;

  return (
    <div className={styles.messageContainer}>
      {children}
      {footer}
    </div>
  );
};

export default MessageContainer;
