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
