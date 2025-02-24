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

import React, { FC, PropsWithChildren } from 'react';

import { useSpring, animated, SpringConfig } from '@react-spring/web';

interface AnimatedItemProps {
  specificClassName: string;
  config: SpringConfig;
}

const AnimatedItem: FC<AnimatedItemProps> = ({ specificClassName, config }) => {
  const props = useSpring({
    from: { opacity: 0 },
    to: { opacity: 1 },
    config,
    loop: { reverse: true },
  });

  return <animated.div style={props} className={`blur-md mix-blend-overlay absolute ${specificClassName}`} />;
};

export const BorderGradientFade: FC<PropsWithChildren<{ border: boolean }>> = ({ children, border }) => {
  const config: SpringConfig = { duration: 1500 };
  return (
    <div className="relative w-full h-full group overflow-hidden">
      {border && (
        <>
          <AnimatedItem
            specificClassName="left-0 top-0 h-2 w-full bg-gradient-to-r from-[#AA6EEE] to-[#8D99FF]"
            config={config}
          />
          <AnimatedItem
            specificClassName="right-0 top-2 bottom-0 w-2 bg-gradient-to-b from-[#8D99FF] to-[#A0FCFD]"
            config={config}
          />
          <AnimatedItem
            specificClassName="left-0 right-2 bottom-0 h-2 w-full bg-gradient-to-l from-[#A0FCFD] to-[#C686FF]"
            config={config}
          />
          <AnimatedItem
            specificClassName="left-0 top-2 bottom-2 w-2 bg-gradient-to-t from-[#C686FF] via-[#37E1BE] to-[#AA6EEE]"
            config={config}
          />
        </>
      )}
      <div className={'h-full'}>{children}</div>
    </div>
  );
};
