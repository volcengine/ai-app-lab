import React from 'react';

import { Empty } from '@arco-design/web-react';

import { IconErrorTypeHighSaturation } from '@/icon';
import styles from './index.module.less';

const ErrorNotice = () => (
  <div className={styles.errorNotice}>
    <Empty
      icon={<div className='flex justify-center items-center'>
        <IconErrorTypeHighSaturation fontSize={80} />
      </div>}
      description={
        <div>
          <div>执行此操作时遇到了一些问题。 </div>
          <div>无需担心,它会自行处理这些错误。</div>
        </div>
      }
    />
  </div>
);

export default ErrorNotice;
