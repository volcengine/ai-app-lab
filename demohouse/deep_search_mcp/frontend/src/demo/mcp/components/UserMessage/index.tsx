import type { FC } from 'react';
import s from './index.module.less';

interface Props {
  id: string;
  content: string;
}

const UserMessage: FC<Props> = props => {
  const { id, content } = props;

  return (
    <>
      <div className={'flex justify-end w-full mb-2'}>
        <div />
      </div>
      <div className={'flex justify-end w-full mb-6'}>
        <div className={s.msg}>{content}</div>
      </div>
    </>
  );
};

export default UserMessage;
