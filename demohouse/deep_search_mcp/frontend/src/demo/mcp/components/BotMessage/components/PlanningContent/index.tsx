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
