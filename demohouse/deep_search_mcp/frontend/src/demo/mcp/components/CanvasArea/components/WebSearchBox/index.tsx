import React from 'react';

import styles from './index.module.less';
import SearchItem from './SearchItem';

interface Reference {
  url: string;
  title: string;
  site_name: string;
  logo_url: string;
}

interface Props {
  query: string;
  references?: Reference[];
}

const WebSearchBox = (props: Props) => {
  const { references } = props;

  const onClickResourceItem = (reference: Reference) => {
    window.open(reference.url);
  };

  return (
    <div className={styles.webSearchBox}>
      <div className="flex flex-col gap-[8px]">
        {references?.map((reference, referenceIndex) => (
          <div
            key={referenceIndex}
            className={styles.resourceItem}
            onClick={() => {
              onClickResourceItem(reference);
            }}
          >
            {/* <span>
              {referenceIndex + 1}. {reference.title}
            </span>
            <span className={styles.split}> I </span>
            <span className={styles.site}>{reference.site_name}</span> */}
            <SearchItem title={reference.title} site={reference.site_name} logoUrl={reference.logo_url} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WebSearchBox;
