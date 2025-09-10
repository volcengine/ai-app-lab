import { FC, useRef } from 'react';

import { useSize } from 'ahooks';

import { IconBotAvatar } from '@/images';

import styles from './index.module.less';

interface Props {
  id: number;
  content: string;
}

const UserMessage: FC<Props> = props => {
  const { content } = props;
  const userMessageRef = useRef<HTMLSpanElement>(null);

  const size = useSize(userMessageRef);
  const { width = 0 } = size || {};
  return (
    <div className="mb-[16px]">
      <div
        className={`relative mb-[12px] flex justify-center ${width < 700 ? 'items-end' : 'items-center'} ${
          width < 700 ? '' : 'flex-col'
        } relative  items-end mt-[5px] top-[2px] ${styles.hiddenScroll} `}
      >
        <IconBotAvatar className=" relative top-[6px] shrink-0" />
        <span
          ref={userMessageRef}
          className="bg-[color:transparent] break-all text-neutral-950 text-base font-medium leading-snug tracking-tight"
        >
          {content}
        </span>
      </div>
    </div>
  );
};

export default UserMessage;
