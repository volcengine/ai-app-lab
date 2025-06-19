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
