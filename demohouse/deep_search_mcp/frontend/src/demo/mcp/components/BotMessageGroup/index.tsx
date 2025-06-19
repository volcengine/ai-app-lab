import { useEffect, useState } from 'react';

import { Message } from '../../types/message';
import BotMessage from '../BotMessage';
import MessageFooter from '../MessageFooter';
import PlanningConfirm from '../PlanningConfirm';

interface Props {
  data: Message[];
  isLast: boolean;
  retryMessage: () => void;
  startTask: () => void;
}

const BotMessageGroup = (props: Props) => {
  const { data, isLast, retryMessage, startTask } = props;
  const [currentVersion, setCurrentVersion] = useState(0);
  const message = data[currentVersion];

  const updateCurrent = (val: number) => {
    setCurrentVersion(val);
  };

  useEffect(() => {
    // 数量变化时，更新 currentVersion 到最新
    setCurrentVersion(data.length - 1);
  }, [data.length]);

  if (!message) {
    return null;
  }

  return (
    <div>
      <BotMessage
        message={message}
        footer={
          <MessageFooter
            message={message}
            isLast={isLast}
            current={currentVersion}
            total={data.length}
            updateCurrent={updateCurrent}
            retryMessage={retryMessage}
          />
        }
        confirmFooter={<PlanningConfirm isLast={isLast} message={message} startTask={startTask} />}
      />
    </div>
  );
};

export default BotMessageGroup;
