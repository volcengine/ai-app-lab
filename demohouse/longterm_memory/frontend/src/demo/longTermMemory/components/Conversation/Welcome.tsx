import { useChat } from '@/demo/longTermMemory/hooks/useChat';

import s from './index.module.less';

const SUGGESTED_QUESTIONS = ['我度假回来了，好晒呀', '终于周末了，晚上吃点什么呢'];

export const Welcome = () => {
  const { sendUserMsg } = useChat();
  return (
    <div className={s.welc}>
      <img
        src={'https://lf3-static.bytednsdoc.com/obj/eden-cn/LM-STH-hahK/ljhwZthlaukjlkulzlp/ark/app/memory_bot.png'}
        className={s.avatar}
      />
      <div className={s.title}>长记忆-舟舟</div>
      <div className={s.desc}>Hi~ 朋友, 有什么新鲜事想跟我聊聊吗?</div>
      <div className={s.list}>
        {SUGGESTED_QUESTIONS.map(str => (
          <div key={str} className={s.q} onClick={() => sendUserMsg(str)}>
            {str}
          </div>
        ))}
      </div>
    </div>
  );
};
