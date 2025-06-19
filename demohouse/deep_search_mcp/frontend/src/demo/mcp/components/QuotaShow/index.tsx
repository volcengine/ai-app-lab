import { useEffect, useState } from 'react';

import styles from './index.module.less';

interface Props {
  usage: number;
  quota: number;
  needSimple?: boolean;
}

const QuotaShow = (props: Props) => {
  const { usage, quota, needSimple } = props;

  const [simple, setSimple] = useState(false);

  const triggerSimple = () => {
    setSimple(prev => !prev);
  };

  useEffect(() => {
    if (needSimple) {
      setSimple(true);
    }
  }, [needSimple]);

  return (
    <div
      className={styles.quotaShow}
      onClick={() => {
        triggerSimple();
      }}
    >
      {!simple && <span className="text-[11px]">{'本周还剩'}</span>}
      <span
        className={styles.quotaBoldText}
      >{`${Math.max(usage, 0)}/${quota}`}</span>
      {!simple && <span>{'次'}</span>}
    </div>
  );
};

export default QuotaShow;
