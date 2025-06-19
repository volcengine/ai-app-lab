import React from 'react';

import KnowledgeItem from './KnowledgeItem';

interface Reference {
  summary: string;
  doc_id: string;
  doc_name: string;
  doc_type: string;
  chunk_title: string;
  chunk_id: string;
}

interface Props {
  references: Reference[];
}

const KnowledgeBox = (props: Props) => {
  const { references } = props;

  return (
    <div className="flex gap-[8px] flex-col p-[12px]">
      {references.map((item, index) => (
        <KnowledgeItem key={index} content={item.summary} docName={item.doc_name} />
      ))}
    </div>
  );
};

export default KnowledgeBox;
