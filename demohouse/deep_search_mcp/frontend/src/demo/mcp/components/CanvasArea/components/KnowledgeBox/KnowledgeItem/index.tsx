import React from 'react';

import { Typography } from '@arco-design/web-react';
import { IconFileImage } from '@arco-design/web-react/icon';

import styles from './index.module.less';

interface Props {
  content: string;
  docName: string;
}

const KnowledgeItem = (props: Props) => {
  const { content, docName } = props;

  return (
    <div className={styles.knowledgeItem}>
      <Typography.Ellipsis
        rows={2}
        showTooltip={{
          prefixCls: 'arco-popover',
          triggerProps: { mouseEnterDelay: 300 },
        }}
        expandable={false}
        className={styles.knowledgeContent}
      >
        {content}
      </Typography.Ellipsis>
      <div className={styles.knowledgeTitle}>
        <IconFileImage fontSize={16} />
        <span>{docName}</span>
      </div>
    </div>
  );
};

export default KnowledgeItem;
