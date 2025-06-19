import { useEffect, useRef, useState } from 'react';

// 自动滚动到底部
export const useScrollToBottom = (defaultAutoScroll?: boolean, direction: 'horizon' | 'vertical' = 'vertical') => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(Boolean(defaultAutoScroll));

  function scrollDomToBottom(to?: number) {
    const dom = scrollRef.current;
    if (dom) {
      requestAnimationFrame(() => {
        setAutoScroll(defaultAutoScroll || false);
        if (direction === 'vertical') {
          dom.scrollTo({ top: to || dom.scrollHeight, behavior: 'smooth' });
        } else {
          dom.scrollTo({ left: to || dom.scrollWidth, behavior: 'smooth' });
        }
      });
    }
  }

  // auto scroll
  useEffect(() => {
    if (autoScroll) {
      scrollDomToBottom();
    }
  });

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
    scrollDomToBottom,
  };
};
