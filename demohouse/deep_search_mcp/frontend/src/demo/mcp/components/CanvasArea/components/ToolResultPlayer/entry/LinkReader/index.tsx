import React from 'react';

import { Event } from '@/demo/mcp/types/event';

import BaseContent from '../../baseContent';
import LinkReaderBox from '../../../LinkReaderBox';
import PlayerBroadcast from '../../../PlayerBroadcast';

interface LinkReaderProps {
  data: Event;
}
const LinkReader = (props: LinkReaderProps) => {
  const { data } = props;
  const parsedResults = { results: data.result?.results };

  return (
    <BaseContent header={<PlayerBroadcast type={data.type} />}>
      <LinkReaderBox key={data.id} data={parsedResults} />
    </BaseContent>
  );
};

export default LinkReader;
