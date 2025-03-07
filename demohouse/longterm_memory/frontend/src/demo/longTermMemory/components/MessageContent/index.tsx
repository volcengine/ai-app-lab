import { FC, useEffect, useState } from 'react';

const MessageContent: FC<{
  message: string;
  isAnimate: boolean;
}> = ({ message, isAnimate }) => {
  const [showAnimation, setShowAnimation] = useState(isAnimate);

  useEffect(() => {
    let timer: number;

    if (isAnimate) {
      setShowAnimation(true);
    } else if (!isAnimate && showAnimation) {
      // 假设动画持续时间为 500 毫秒
      timer = window.setTimeout(() => {
        setShowAnimation(false);
      }, 500);
    }

    return () => clearTimeout(timer);
  }, [isAnimate, showAnimation]);

  return <div>{message}</div>;
};

export default MessageContent;
