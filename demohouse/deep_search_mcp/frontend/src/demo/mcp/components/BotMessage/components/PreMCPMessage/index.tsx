import { ReactNode, useMemo } from 'react';

import { EventType } from '@/demo/mcp/types/event';
import { Message } from '@/demo/mcp/types/message';
import { Step } from '@/demo/mcp/types/step';

import styles from './index.module.less';
import MessageContainer from '../MessageContainer';
import StepItem from '../TaskSteps/StepItem';

interface Props {
  message: Message;
  footer: ReactNode;
}

const eventComponentConfig = {
  [EventType.OutputText]: {
    autoFold: false,
  },
};

const PreMCPMessage = (props: Props) => {
  const { message, footer } = props;
  const { events } = message;

  // 满足 ux 要求的 steps 聚合
  const stepsData = useMemo(() => {
    if (!events) {
      return [];
    }

    // 过滤掉 output_text 中内容是\n\n或\n的事件，视为无效事件
    const filteredEvents = events.filter(
      item => item.type !== EventType.OutputText || (item.result !== '\n\n' && item.result !== '\n'),
    );

    // 寻找steps的头和尾
    const stepsStartIndex = filteredEvents.findIndex(item => item.type === EventType.AssignTodo);
    let stepsEndIndex = filteredEvents.findLastIndex(
      item => item.type === EventType.Planning && item.result?.action === 'done',
    );
    if (stepsEndIndex === -1) {
      stepsEndIndex = filteredEvents.length - 1;
    }

    if (stepsStartIndex === -1) {
      const lastPlanningMade = filteredEvents.findLast(
        item => item.type === EventType.Planning && item.result?.action === 'made',
      );
      // 处理成 Step
      const prefixStep: Step = {
        id: 'prefix_step',
        description: '任务规划',
        finish: Boolean(lastPlanningMade),
        events: filteredEvents,
      };
      return [prefixStep];
    }

    return [];
  }, [message]);

  const showPlanningConfirm = useMemo(() => {
    if (stepsData.length === 0) {
      return false;
    }
    const lastStep = stepsData[stepsData.length - 1];
    return lastStep.id === 'prefix_step';
  }, [stepsData]);

  if (stepsData.length === 0) {
    return null;
  }

  return (
    <div className={styles.messageContainer}>
      <MessageContainer footer={showPlanningConfirm ? footer : null}>
        <div>
          <StepItem step={stepsData[0]} expandable={false} eventComponentConfig={eventComponentConfig} />
        </div>
      </MessageContainer>
    </div>
  );
};

export default PreMCPMessage;
