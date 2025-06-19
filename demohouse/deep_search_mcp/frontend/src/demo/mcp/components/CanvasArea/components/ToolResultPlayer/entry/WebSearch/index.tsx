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

import { Typography } from '@arco-design/web-react';

import { Event } from '@/demo/mcp/types/event';

import BaseContent from '../../baseContent';
import WebSearchBox from '../../../WebSearchBox';
import PlayerBroadcast from '../../../PlayerBroadcast';
import styles from './index.module.less';

interface Props {
  data: Event;
}

const WebSearch = (props: Props) => {
  const { data } = props;

  if (!data.result) {
    return null;
  }

  return (
    <BaseContent
      header={
        <PlayerBroadcast
          type={data.type}
          suffix={
            <div className="flex items-center overflow-hidden">
              <span className="shrink-0">搜索</span>
              <Typography.Ellipsis
                rows={1}
                showTooltip={{ prefixCls: 'arco-popover', triggerProps: { mouseEnterDelay: 300 } }}
                expandable={false}
                className={styles.tag}
              >
                {data.result?.query}
              </Typography.Ellipsis>
            </div>
          }
        />
      }
    >
      <WebSearchBox key={data.id} query={data.result.query || ''} references={data.result.references || []} />
    </BaseContent>
  );
};

export default WebSearch;
