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
