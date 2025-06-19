import React, { ReactNode, useMemo } from 'react';

import { getBroadcastInfo } from './source';
import styles from './index.module.less';

interface Props {
  type: string;
  suffix?: ReactNode;
}

const PlayerBroadcast = (props: Props) => {
  const { type, suffix } = props;

  const broadcastInfo = useMemo(() => {
    const data = getBroadcastInfo(type);
    return data;
  }, [type]);

  return (
    <div className={styles.broadcastPlayer}>
      {/* <div className={styles.imgWrapper}>
        <img className="rounded-[4px]" src={broadcastInfo.iconSrc} />
      </div> */}
      <span className="shrink-0">正在使用</span>
      <div className={styles.tag}>{`${broadcastInfo.name || broadcastInfo.type} MCP 服务`}</div>
      {suffix}
    </div>
  );
};

export default PlayerBroadcast;
