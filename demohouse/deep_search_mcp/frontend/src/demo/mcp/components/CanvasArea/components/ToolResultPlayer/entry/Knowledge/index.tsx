import React from 'react';

import { Event } from '@/demo/mcp/types/event';

import BaseContent from '../../baseContent';
import KnowledgeBox from '../../../KnowledgeBox';
import PlayerBroadcast from '../../../PlayerBroadcast';

interface KnowledgeProps {
  data: Event;
}

const Knowledge = (props: KnowledgeProps) => {
  const { data } = props;

  return (
    <BaseContent header={<PlayerBroadcast type={data.type} />}>
      <KnowledgeBox key={data.id} references={data.result.references} />;
    </BaseContent>
  );
};

export default Knowledge;
