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

import { useEffect, useRef, useState } from 'react';

import { Progress } from '@arco-design/web-react';


import styles from './index.module.less';
import { RunningPhaseStatus } from '../../types';

interface Props {
  runningPhaseStatus: RunningPhaseStatus;
}

const LoadingFilm = (props: Props) => {
  const { runningPhaseStatus } = props;
  const timerRef = useRef<number>();
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (runningPhaseStatus === RunningPhaseStatus.Pending) {
      timerRef.current = window.setInterval(() => {
        setPercent(prev => {
          if (prev >= 98) {
            clearInterval(timerRef.current);
            return 98;
          }
          return prev + 2;
        });
      }, 1000);
    }
    if (runningPhaseStatus === RunningPhaseStatus.Ready) {
      setPercent(0);
    }
    if (runningPhaseStatus === RunningPhaseStatus.Success) {
      clearInterval(timerRef.current);
      setPercent(100);
    }
    if (runningPhaseStatus === RunningPhaseStatus.RequestError) {
      clearInterval(timerRef.current);
      setPercent(0);
    }
    return () => {
      clearInterval(timerRef.current);
    };
  }, [runningPhaseStatus]);

  return (
    <div className={styles.loadingContainer}>
      {runningPhaseStatus === RunningPhaseStatus.Pending && (
        <Progress
          percent={percent}
          color={{
            '0%': '#ce63ff',
            '40%': '#0093ff',
            '100%': '#0060ff',
          }}
          className={styles.progress}
          size="mini"
          showText={false}
        />
      )}

      <span>{'视频剪辑中'}</span>
    </div>
  );
};

export default LoadingFilm;
