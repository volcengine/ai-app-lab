import React from 'react';

import { Event } from '@/demo/mcp/types/event';

import BaseContent from '../../baseContent';
import PlayerBroadcast from '../../../PlayerBroadcast';
import CommonTypeBox from '../../../CommonTypeBox';

interface CommonProps {
  data: Event;
}

const Common = (props: CommonProps) => {
  const { data } = props;
  const parsedResults = { results: data.result };

  return (
    <BaseContent header={<PlayerBroadcast type={data.type} />}>
      <CommonTypeBox key={data.id} data={parsedResults} />
    </BaseContent>
  );
};

export default Common;
