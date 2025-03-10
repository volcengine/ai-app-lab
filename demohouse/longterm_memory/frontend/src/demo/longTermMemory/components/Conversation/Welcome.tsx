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
