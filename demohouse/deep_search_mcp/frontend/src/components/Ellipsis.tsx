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
