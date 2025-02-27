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

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';


import { useTransition, animated } from '@react-spring/web';
import { Button, Steps } from '@arco-design/web-react';

import s from './index.module.less';

const { Step } = Steps;
export const StepsSection = ({ visible }: { visible: boolean }) => {
  const transitions = useTransition(visible, {
    from: { opacity: 0, transform: 'translateX(100%)' },
    enter: { opacity: 1, transform: 'translateX(0%)' },
    leave: { opacity: 0, transform: 'translateX(100%)' },
  });

  return transitions(
    (styles, item) =>
      item && (
        <animated.div style={styles}>
          <Steps
            current={0}
            className={'h-10 w-[540px] rounded-md bg-white items-center px-10'}
            style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.05)' }}
            size="small"
          >
            <Step className={s.icon} title={'生成故事创意'} />
            <Step className={s.icon} title={'生成分镜脚本'} />
            <Step className={s.icon} title={'生成故事视频'} />
          </Steps>
        </animated.div>
      ),
  );
};

export const FlowMiniMap = forwardRef<{
  close: () => void;
}>((_, ref) => {
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    close: () => {
      setVisible(false);
    },
  }));

  return (
    <div className={'flex items-center gap-[14px] relative'}>
      <StepsSection visible={visible} />
      <Button
        className={'!w-10 !h-10 !bg-white rounded-md flex justify-center items-center'}
        onClick={() => setVisible(prev => !prev)}
        icon={
          <svg width="23" height="23" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_1362_73136)">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M17.8056 0.935425C19.6138 0.935425 21.0796 2.40124 21.0796 4.20941C21.0796 6.01758 19.6138 7.4834 17.8056 7.4834C16.3227 7.4834 15.07 6.49746 14.6673 5.14532L7.74979 5.14484C6.32908 5.14484 5.17737 6.29655 5.17737 7.71726C5.17737 9.13796 6.32908 10.2897 7.74979 10.2897H15.7009C18.1548 10.2897 20.1442 12.279 20.1442 14.7329C20.1442 17.1869 18.1548 19.1762 15.7009 19.1762L8.78334 19.1767C8.3807 20.5288 7.12803 21.5148 5.64508 21.5148C3.83691 21.5148 2.37109 20.049 2.37109 18.2408C2.37109 16.4326 3.83691 14.9668 5.64508 14.9668C7.1282 14.9668 8.38099 15.953 8.78348 17.3053L15.7009 17.3054C17.1216 17.3054 18.2733 16.1536 18.2733 14.7329C18.2733 13.3122 17.1216 12.1605 15.7009 12.1605H7.74979C5.29584 12.1605 3.30652 10.1712 3.30652 7.71726C3.30652 5.26331 5.29584 3.27399 7.74979 3.27399L14.6672 3.27397C15.0697 1.92159 16.3225 0.935425 17.8056 0.935425ZM5.64484 16.8376C4.86991 16.8376 4.2417 17.4659 4.2417 18.2408C4.2417 19.0157 4.86991 19.6439 5.64484 19.6439C6.41977 19.6439 7.04797 19.0157 7.04797 18.2408C7.04797 17.4659 6.41977 16.8376 5.64484 16.8376ZM16.4022 4.20941C16.4022 3.43448 17.0304 2.80627 17.8054 2.80627C18.5803 2.80627 19.2085 3.43448 19.2085 4.20941C19.2085 4.98434 18.5803 5.61255 17.8054 5.61255C17.0304 5.61255 16.4022 4.98434 16.4022 4.20941Z"
                fill="#42464E"
              />
            </g>
            <defs>
              <clipPath id="clip0_1362_73136">
                <rect width="22.4502" height="22.4502" fill="white" transform="translate(0.5)" />
              </clipPath>
            </defs>
          </svg>
        }
      />
    </div>
  );
});
