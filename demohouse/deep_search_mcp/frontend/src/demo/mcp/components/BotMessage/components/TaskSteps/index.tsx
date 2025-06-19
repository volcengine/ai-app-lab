import { useContext } from 'react';

import { Timeline } from '@arco-design/web-react';

import StepItem from '@/demo/mcp/components/BotMessage/components/TaskSteps/StepItem';
import { Step } from '@/demo/mcp/types/step';
import { BotMessageContext } from '@/demo/mcp/store/BotMessageContext/context';

import s from './index.module.less';
import Dot from './Dot';

interface Props {
  tasks: Step[];
}

export const TaskSteps = ({ tasks }: Props) => {
  const { finish: messageFinish } = useContext(BotMessageContext);
  const current = tasks.findLastIndex(t => Boolean(t.finish)) + 1;

  return (
    <Timeline className={s.customTimeline} pendingDot={null}>
      {tasks.map((step, index) => (
        <Timeline.Item key={index} dot={<Dot loading={current === index && !messageFinish} />}>
          <StepItem step={step} />
        </Timeline.Item>
      ))}
    </Timeline>
  );
};
