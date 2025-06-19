import { Typography } from '@arco-design/web-react';

import s from './index.module.less';
interface IProps {
  topic: string;
  content: string;
  onClick: (content: string) => void;
}
export const PresetQuestionCard = ({ topic, content, onClick }: IProps) => (
  <div
    className={s.box}
    onClick={() => {
      onClick(content);
    }}
  >
    <div className={s.topic}>{topic}</div>
    <Typography.Ellipsis
      className={s.content}
      rows={4}
      showTooltip={{ prefixCls: 'arco-popover', triggerProps: { mouseEnterDelay: 300 } }}
      expandable={false}
    >
      {content}
    </Typography.Ellipsis>
  </div>
);
