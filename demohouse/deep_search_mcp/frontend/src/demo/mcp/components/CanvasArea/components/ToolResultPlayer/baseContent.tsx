import React, { PropsWithChildren, ReactNode } from 'react';

import styles from './index.module.less';

interface Props {
  header?: ReactNode;
}

const BaseContent = (props: PropsWithChildren<Props>) => {
  const { header, children } = props;
  return (
    <div className={styles.baseContent}>
      <div className={styles.contentHeader}>{header}</div>
      <div className={styles.resultContent}>{children}</div>
    </div>
  );
};

export default BaseContent;
