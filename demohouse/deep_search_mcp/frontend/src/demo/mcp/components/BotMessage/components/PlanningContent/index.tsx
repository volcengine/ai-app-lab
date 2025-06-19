import React from 'react';

import { Event } from '@/demo/mcp/types/event';
import { ReactComponent as IconPlanning } from '@/demo/mcp/assets/icon_planning.svg';

import Collapse from '../../../Collapse';
import { AnimatedSubtitle } from '../AnimatedSubtitle';
import styles from './index.module.less';

interface Props {
  data: Event;
}

const PlanningContent = ({ data }: Props) => {
  const { result } = data;

  if (!result?.planning?.items) {
    return null;
  }

  return (
    <div>
      <Collapse
        title={<AnimatedSubtitle icon={<IconPlanning />} text={'任务规划'} isLoading={false} />}
        defaultOpen={true}
      >
        <ul className={styles.planningContent}>
          {result.planning.items.map((item: { id: string; description: string }) => (
            <li key={item.id} className={styles.item}>
              {item.description}
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
};

export default PlanningContent;
