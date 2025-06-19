import React from 'react';

import { ReactComponent as IconSummary } from '@/images/deepResearch/icon_summary.svg';
import MessageContent from '@/components/Chat/components/MessageItem/components/MessageContent';

import Collapse from '../../../Collapse';
import { AnimatedSubtitle } from '../AnimatedSubtitle';
import styles from './index.module.less';

interface Props {
  content: string;
  finish: boolean;
  autoFold?: boolean;
}

const SummaryContent = (props: Props) => {
  const { content, finish, autoFold = true } = props;

  return (
    <Collapse
      title={<AnimatedSubtitle icon={<IconSummary />} isLoading={!finish} text={'Summary'} />}
      defaultOpen={true}
      autoFold={autoFold && finish}
    >
      <MessageContent message={content} isAnimate={!finish} className={styles.thinkingMarkdown} />
    </Collapse>
  );
};

export default SummaryContent;
