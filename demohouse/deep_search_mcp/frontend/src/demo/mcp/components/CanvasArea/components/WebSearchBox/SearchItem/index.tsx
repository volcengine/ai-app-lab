import React from 'react';

import { Divider } from '@arco-design/web-react';

import { IconEarth } from '@/icon';
import styles from './index.module.less';

interface Props {
  title: string;
  site: string;
  logoUrl: string;
}

const SearchItem = (props: Props) => {
  const { title, site, logoUrl } = props;

  return (
    <div className={styles.searchItem}>
      <div className={styles.imgWrapper}>
        {logoUrl ? <img src={logoUrl} /> : <IconEarth />}
      </div>
      <div className={styles.title}>{title}</div>
      <Divider
        className="mx-[4px]"
        type="vertical"
        style={{ height: '9px', borderColor: '#C7CCD6' }}
      />
      <div className={styles.site}>{site}</div>
    </div>
  );
};

export default SearchItem;
