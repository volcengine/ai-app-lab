import React from 'react';

import Recognizing from '../recognizing';
import styles from './index.module.less';

interface Props {
  imageBase64: string;
  notPassed: boolean;
}

const SAM = (props: Props) => {
  const { imageBase64, notPassed } = props;

  return (
    <div className={styles.container}>
      {!notPassed && <Recognizing />}
      <img className={styles.image} src={imageBase64} />
    </div>
  );
};

export default SAM;
