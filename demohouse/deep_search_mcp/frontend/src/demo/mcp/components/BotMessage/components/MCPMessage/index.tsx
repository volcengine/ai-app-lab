import { ReactNode, useMemo } from 'react';

import MessageContent from '@/components/Chat/components/MessageItem/components/MessageContent';
import { Event, EventType } from '@/demo/mcp/types/event';
import { Message } from '@/demo/mcp/types/message';
import { Step } from '@/demo/mcp/types/step';
import { ReactComponent as IconRiskText } from '@/images/icon_risk_text.svg';

import styles from './index.module.less';
import { TaskSteps } from '../TaskSteps';
import MessageContainer from '../MessageContainer';
import { ReferenceContent } from '../ReferenceContent';

interface Props {
  message: Message;
  footer: ReactNode;
}

const MCPMessage = (props: Props) => {
  const { message, footer } = props;
  const { events } = message;

  const getStepsData = (stepEvents: Event[]) => {
    const result = [];
    let stepStartIndex = stepEvents.findIndex(item => item.type === 'assign_todo');
    let stepEndIndex = stepEvents.findIndex(item => item.type === 'planning');
    while (stepStartIndex !== -1) {
      // 解析数据
      const stepInfo = stepEvents[stepStartIndex];
      const step: Step = {
        id: stepInfo.id,
        description: stepInfo.result?.planning_item?.description,
        finish: false,
        events: [],
      };
      if (stepEndIndex !== -1) {
        step.finish = true;
      } else {
        stepEndIndex = stepEvents.length - 1;
      }

      step.events = stepEvents.slice(stepStartIndex + 1, stepEndIndex + 1);
      result.push(step);
      // 寻找下一个 step
      stepStartIndex = stepEvents.findIndex(
        (item, index) => item.type === 'assign_todo' && index >= stepStartIndex + 1,
      );
      stepEndIndex = stepEvents.findIndex(
        (item, index) => item.type === 'planning' && item.result.action === 'update' && index >= stepEndIndex + 1,
      );
    }
    return result.map((item, index) => ({ ...item, stepNumber: index + 1 }));
  };

  // 满足 ux 要求的 steps 聚合
  const stepsData = useMemo(() => {
    if (!events) {
      return [];
    }

    // 过滤掉 output_text 中内容是\n\n或\n的事件，视为无效事件
    const filteredEvents = events.filter(
      item => item.type !== EventType.OutputText || (item.result !== '\n\n' && item.result !== '\n'),
    );

    // 兼容旧数据，查找任务规划是否存在
    const hasPlanningMade = filteredEvents.some(
      item => item.type === EventType.Planning && item.result?.action === 'made',
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
      // before 不在这里处理
      // const lastPlanningMade = filteredEvents.findLast(
      //   item => item.type === EventType.Planning && item.result?.action === 'made',
      // );
      // // 处理成 Step
      // const prefixStep: Step = {
      //   id: 'prefix_step',
      //   description: '任务规划',
      //   finish: Boolean(lastPlanningMade),
      //   events: filteredEvents,
      // };
      // return [prefixStep];
      return [];
    }

    const stepsBefore = filteredEvents.slice(0, stepsStartIndex);
    const steps = filteredEvents.slice(stepsStartIndex, stepsEndIndex + 1);
    const stepsAfter = filteredEvents.slice(stepsEndIndex + 1);
    // 处理成 step
    const prefixStep: Step = {
      id: 'prefix_step',
      description: '问题拆解',
      finish: true,
      events: stepsBefore,
    };
    const parsedSteps = getStepsData(steps);
    // 聚合 steps
    const resultSteps: Step[] = [...parsedSteps];
    if (stepsAfter.length > 0) {
      const suffixStep: Step = {
        id: 'suffix_step',
        description: '结论推导',
        finish: stepsAfter.some(item => item.type === 'output_text'),
        events: stepsAfter.filter(item => item.type !== 'output_text'),
      };
      resultSteps.push(suffixStep);
    }
    if (hasPlanningMade) {
      resultSteps.unshift(prefixStep);
    }

    // 旧：任务规划、步骤执行和结论推导
    // 新：步骤执行和结论推导
    return resultSteps;
  }, [message]);

  // 最终的 output_text
  const finalContent = useMemo(() => {
    if (!events) {
      return null;
    }
    const stepsEndIndex = events.findLastIndex(item => item.type === 'planning' && item.result?.action === 'done');
    if (stepsEndIndex === -1) {
      return null;
    }
    const steps = events.slice(stepsEndIndex + 1);
    // 找到最后一个 output_text
    const lastOutputText = steps.findLast(item => item.type === 'output_text');
    if (!lastOutputText) {
      return null;
    }
    return lastOutputText;
  }, [message]);

  const errorContent = useMemo(() => {
    if (!events) {
      return null;
    }
    const errorEvent = events.find(item => item.type === 'error');
    if (!errorEvent) {
      return null;
    }
    return errorEvent;
  }, [message]);

  const pauseEvent = useMemo(() => {
    if (!events) {
      return null;
    }
    return events.find(item => item.type === 'manual-pause');
  }, [message]);

  return (
    <div className={styles.messageContainer}>
      <MessageContainer>
        <TaskSteps tasks={stepsData} />
      </MessageContainer>
      {errorContent && (
        <MessageContainer footer={footer}>
          <div className={styles.errorContainer}>
            <IconRiskText className="shrink-0" />
            <span className={styles.errorText}>{errorContent.result}</span>
          </div>
        </MessageContainer>
      )}
      {pauseEvent && (
        <MessageContainer footer={footer}>
          <div className={styles.errorContainer}>
            <span className={styles.errorText}>{pauseEvent.result}</span>
          </div>
        </MessageContainer>
      )}
      {finalContent && (
        <MessageContainer footer={footer}>
          <MessageContent message={finalContent.result} isAnimate={finalContent.status !== 'finish'} />
          {message.finish && <ReferenceContent message={message} />}
        </MessageContainer>
      )}
    </div>
  );
};

export default MCPMessage;
