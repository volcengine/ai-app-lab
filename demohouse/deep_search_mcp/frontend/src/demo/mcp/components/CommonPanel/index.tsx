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
