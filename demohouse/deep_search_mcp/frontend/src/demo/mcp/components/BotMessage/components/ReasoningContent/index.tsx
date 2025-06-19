import React from 'react';

import { ReactComponent as IconThinking } from '@/images/deepResearch/icon_thinking.svg';
import MessageContent from '@/components/Chat/components/MessageItem/components/MessageContent';

import Collapse from '../../../Collapse';
import { AnimatedSubtitle } from '../AnimatedSubtitle';
import styles from './index.module.less';

interface Props {
  content: string;
  finish: boolean;
  round?: number;
}

const ReasoningContent = (props: Props) => {
  const { content, finish, round } = props;

  return (
    <Collapse
      title={
        <AnimatedSubtitle
          icon={<IconThinking style={{ color: '#42464E' }} />}
          isLoading={!finish}
          text={round ? `Thinking - Round${round}` : 'Thinking'}
        />
      }
      defaultOpen={true}
      autoFold={finish}
    >
      <MessageContent message={content} isAnimate={!finish} className={styles.thinkingMarkdown} />
    </Collapse>
  );
};

export default ReasoningContent;
