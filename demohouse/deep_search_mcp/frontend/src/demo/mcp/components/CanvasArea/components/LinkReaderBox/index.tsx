import React from 'react';
import ReactJson from 'react-json-view';

import styles from './index.module.less';

interface Props {
  data: { results: any[] };
}

const reactJsonProps = {
  displayDataTypes: false,
  theme: 'shapeshifter:inverted' as const,
};

const LinkReaderBox = (props: Props) => {
  const { data } = props;

  return (
    <div className={styles.linkReaderBox}>
      <ReactJson
        name={false}
        style={{
          padding: '4px',
          width: '100%',
          overflow: 'auto',
        }}
        {...reactJsonProps}
        enableClipboard={false}
        src={data}
      />
    </div>
  );
};

export default LinkReaderBox;
