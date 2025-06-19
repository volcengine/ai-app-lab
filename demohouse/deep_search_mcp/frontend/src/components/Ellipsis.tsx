import { ReactNode, FC, PropsWithChildren, useRef, useState } from 'react';

import { TooltipProps, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';

interface Props {
  line?: 1 | 2 | 3 | 4 | 5;
  className?: string;
  position?: TooltipProps['position'];
  content?: ReactNode;
}

export const Ellipsis: FC<PropsWithChildren<Props>> = ({ children, line = 1, className, position, content }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  const handleVisibleChange = (value: boolean) => {
    if (value) {
      if (!ref.current) {
        return;
      }
      const { lineHeight } = window.getComputedStyle(ref.current, null);
      const { offsetHeight } = ref.current;
      setVisible(offsetHeight > parseFloat(lineHeight) * line);
      return;
    }
    setVisible(value);
  };

  return (
    <Tooltip
      position={position}
      content={
        <div className="xl:max-h-[350px] max-h-[500px] overflow-auto whitespace-pre-line">{content ?? children}</div>
      }
      popupVisible={visible}
      onVisibleChange={handleVisibleChange}
    >
      <span
        className={classNames(className, 'overflow-ellipsis', 'break-words', 'whitespace-pre-line', {
          'line-clamp-1': line === 1,
          'line-clamp-2': line === 2,
          'line-clamp-3': line === 3,
          'line-clamp-4': line === 4,
          'line-clamp-5': line === 5,
        })}
      >
        <span ref={ref}>{children}</span>
      </span>
    </Tooltip>
  );
};
