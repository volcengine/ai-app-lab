// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
