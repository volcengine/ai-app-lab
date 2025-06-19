import React from 'react';

import styles from './index.module.less';

interface Props {
  loading?: boolean;
}

const Dot = (props: Props) => {
  const { loading } = props;

  return (
    <div className="relative">
      <div className={loading ? styles.dotLoading : styles.dot} />
      {loading && <div className={styles.dotBreath}></div>}
    </div>
  );
};

export default Dot;
