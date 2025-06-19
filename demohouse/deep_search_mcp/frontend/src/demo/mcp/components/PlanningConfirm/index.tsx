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

import React, { useMemo } from 'react';

import { Button } from '@arco-design/web-react';

import { useInput } from '../../store/InputStore';
import { Message } from '../../types/message';
import styles from './index.module.less';

interface Props {
  message: Message;
  isLast: boolean;
  startTask: () => void;
}

const PlanningConfirm = (props: Props) => {
  const { message, isLast, startTask } = props;
  const setKeyword = useInput(state => state.setKeyword);
  const setIsActive = useInput(state => state.setIsActive);

  const actionType = useMemo(() => {
    const { events } = message;
    if (!events || events.length === 0) {
      return '';
    }
    const lastEvent = events[events.length - 1];
    return lastEvent?.result?.action;
  }, [message]);

  const onModify = () => {
    setKeyword(message.sessionQuery ?? '');
    setTimeout(() => {
      setIsActive(true);
    }, 100);
  };

  const renderButton = () => {
    if (actionType === 'made') {
      return (
        <>
          <Button type="outline" shape="round" onClick={onModify}>
            修改任务
          </Button>
          <Button type="primary" shape="round" onClick={startTask}>
            开始任务
          </Button>
        </>
      );
    }
    if (actionType === 'denied') {
      return (
        <Button type="primary" shape="round" onClick={onModify}>
          补充信息
        </Button>
      );
    }
    return;
  };

  if (!isLast || !message.finish) {
    return null;
  }

  return (
    <div className={styles.confirmWrapper}>
      <div className={styles.btnContainer}>{renderButton()}</div>
    </div>
  );
};

export default PlanningConfirm;
