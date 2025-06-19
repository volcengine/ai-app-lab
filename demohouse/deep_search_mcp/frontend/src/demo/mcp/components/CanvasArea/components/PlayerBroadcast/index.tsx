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
