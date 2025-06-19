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

import { useEffect, useState } from 'react';

import styles from './index.module.less';

interface Props {
  usage: number;
  quota: number;
  needSimple?: boolean;
}

const QuotaShow = (props: Props) => {
  const { usage, quota, needSimple } = props;

  const [simple, setSimple] = useState(false);

  const triggerSimple = () => {
    setSimple(prev => !prev);
  };

  useEffect(() => {
    if (needSimple) {
      setSimple(true);
    }
  }, [needSimple]);

  return (
    <div
      className={styles.quotaShow}
      onClick={() => {
        triggerSimple();
      }}
    >
      {!simple && <span className="text-[11px]">{'本周还剩'}</span>}
      <span
        className={styles.quotaBoldText}
      >{`${Math.max(usage, 0)}/${quota}`}</span>
      {!simple && <span>{'次'}</span>}
    </div>
  );
};

export default QuotaShow;
