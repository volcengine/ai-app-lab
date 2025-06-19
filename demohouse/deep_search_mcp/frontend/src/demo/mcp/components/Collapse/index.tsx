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

import React, { PropsWithChildren, ReactNode, useEffect, useRef, useState } from 'react';

import { useSpring, animated, config } from '@react-spring/web';
import cx from 'classnames';

import { ReactComponent as IconArrowDown } from '@/images/deepResearch/icon_arrow_down.svg';

interface CollapseProps {
  title: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  contentGap?: number;
  onChange?: (open: boolean) => void;
  autoFold?: boolean; // 设置自动收起
  headerClassName?: string;
}

export const Collapse: React.FC<PropsWithChildren<CollapseProps>> = ({
  title,
  icon,
  children,
  defaultOpen = false,
  contentGap = 10,
  autoFold,
  onChange,
  headerClassName,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const usedRef = useRef(false); // 用于是否自动收起过

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [contentHeight, setContentHeight] = useState(0);

  const updateIsOpen = (isOpen: boolean) => {
    setIsOpen(isOpen);
    onChange && onChange(isOpen);
  };

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContentHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (autoFold && !usedRef.current) {
      usedRef.current = true;
      updateIsOpen(false);
    }
  }, [autoFold]);

  // 将 useSpring 移到组件顶层
  const arrowAnimation = useSpring({
    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
    config: { ...config.gentle, tension: 300, friction: 20 },
  });

  const contentAnimation = useSpring({
    from: { height: 0, opacity: 0 },
    to: {
      height: isOpen ? contentHeight : 0,
      opacity: isOpen ? 1 : 0,
    },
    config: {
      ...config.gentle,
      tension: 240,
      friction: 22,
      precision: 0.1,
      clamp: true,
    },
  });

  return (
    <div>
      <div
        onClick={() => updateIsOpen(!isOpen)}
        className={cx(
          'w-full flex items-start justify-between gap-[4px] transition-colors duration-200 cursor-pointer rounded hover:bg-[#F6F8FA]',
          headerClassName,
        )}
      >
        <div className="flex gap-[6px] items-center">
          <>{icon}</>
          <span className="font-medium">{title}</span>
        </div>
        <animated.span className="flex items-center h-[22px]" style={arrowAnimation}>
          <IconArrowDown />
        </animated.span>
      </div>

      <animated.div style={contentAnimation} className="overflow-hidden will-change-[height,opacity]">
        <div ref={contentRef}>
          <div style={{ height: contentGap }}></div>
          {children}
        </div>
      </animated.div>
    </div>
  );
};

export default Collapse;
