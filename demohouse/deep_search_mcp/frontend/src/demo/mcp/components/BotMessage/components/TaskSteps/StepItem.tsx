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

import React, { useContext, useMemo } from 'react';

import { Step } from '@/demo/mcp/types/step';
import { Event, EventType } from '@/demo/mcp/types/event';
import { BotMessageContext } from '@/demo/mcp/store/BotMessageContext/context';

import s from './index.module.less';
import Collapse from '../../../Collapse';
import ReasoningContent from '../ReasoningContent';
import SummaryContent from '../SummaryContent';
import MCPServerContent from '../MCPServerContent';
import PlanningContent from '../PlanningContent';

export interface Props {
  step: Step;
  // 可折叠
  expandable?: boolean;
  eventComponentConfig?: {
    [key in EventType]?: any;
  };
}

interface MultiEvent {
  type: 'multi_event';
  finish: boolean;
  events: Event[];
}

const StepItem = (props: Props) => {
  const { step, expandable = true, eventComponentConfig } = props;
  const { finish: messageFinish } = useContext(BotMessageContext);

  const parsedStep = useMemo(() => {
    // 除去 type: planning 并且 action 不为 made
    const events = step.events.filter(e => e.type !== EventType.Planning || e.result?.action === 'made');
    // 当类型不为 reasoning_text，output_text，且 result.status 为 completed，将其与上一个status 为 pending 的事件合并
    // 有 history 的无需合并
    const completedEvents = events.reduce((acc, cur) => {
      if (
        cur.type !== EventType.ReasoningText &&
        cur.type !== EventType.OutputText &&
        cur.type !== EventType.Planning &&
        !cur.history &&
        cur.result?.status === 'completed'
      ) {
        const lastPendingEventIndex = acc.findLastIndex(e => e.type === cur.type && e.result?.status === 'pending');
        if (acc[lastPendingEventIndex]) {
          acc[lastPendingEventIndex] = { ...acc[lastPendingEventIndex], ...cur };
          return acc;
        }
      }
      acc.push(cur);
      return acc;
    }, [] as Event[]);

    // 将 events 中，不包含 reasoning_text，output_text，planning 的区间，合并成数组
    const result = completedEvents.reduce((acc: (Event | MultiEvent)[], currentEvent) => {
      const isSingleEvent =
        currentEvent.type === EventType.ReasoningText ||
        currentEvent.type === EventType.OutputText ||
        currentEvent.type === EventType.Planning;
      const lastAccItem = acc[acc.length - 1];

      if (isSingleEvent) {
        if (lastAccItem?.type === 'multi_event') {
          (lastAccItem as MultiEvent).finish = true;
        }
        acc.push(currentEvent);
        return acc;
      }

      if (lastAccItem?.type === 'multi_event') {
        (lastAccItem as MultiEvent).events.push(currentEvent);
      } else {
        acc.push({
          type: 'multi_event',
          events: [currentEvent],
          finish: false,
        });
      }

      return acc;
    }, []);

    return {
      ...step,
      parsedData: result,
    };
  }, [step]);

  // 记录 reasoning_text 的 id, 用于渲染轮次
  const reasoningList = useMemo(() => {
    const result: string[] = [];
    step.events.forEach(event => {
      if (event.type === EventType.ReasoningText) {
        result.push(event.id);
      }
    });
    return result;
  }, [step]);

  const renderContent = (data: Event | MultiEvent) => {
    switch (data.type) {
      case EventType.ReasoningText: {
        const roundNumber = reasoningList.indexOf(data.id) + 1;
        return (
          <ReasoningContent
            content={data.result}
            finish={data.status === 'finish' || messageFinish}
            round={roundNumber}
          />
        );
      }
      case EventType.OutputText: {
        const { autoFold = true } = eventComponentConfig?.[EventType.OutputText] || {};
        return (
          <SummaryContent
            content={data.result}
            finish={data.status === 'finish' || messageFinish}
            autoFold={autoFold}
          />
        );
      }
      case EventType.Planning: {
        return <PlanningContent data={data} />;
      }
      case 'multi_event': {
        return (
          <MCPServerContent
            events={(data as MultiEvent).events}
            finish={(data as MultiEvent).finish || messageFinish}
          />
        );
      }
      default: {
        return null;
      }
    }
  };

  const renderMainContent = () => (
    <div className={'pb-[10px] flex flex-col gap-[10px]'}>
      {parsedStep.parsedData.map((data, index) => (
        <div key={index}>{renderContent(data)}</div>
      ))}
    </div>
  );

  if (!expandable) {
    return (
      <div className={'flex flex-col gap-[10px]'}>
        <div className={s.title}>
          {Boolean(step.stepNumber) && <span className={s.tag}>{`STEP ${step.stepNumber}`}</span>}
          <span className={s.text}>{parsedStep.description}</span>
        </div>
        {renderMainContent()}
      </div>
    );
  }

  return (
    <Collapse
      title={
        <div className={s.title}>
          {Boolean(step.stepNumber) && <span className={s.tag}>{`STEP ${step.stepNumber}`}</span>}
          <span className={s.text}>{parsedStep.description}</span>
        </div>
      }
      defaultOpen={true}
    >
      {renderMainContent()}
    </Collapse>
  );
};

export default StepItem;
