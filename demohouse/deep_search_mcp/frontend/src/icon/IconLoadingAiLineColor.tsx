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

import type React from 'react';

interface IconLoadingAiLineColorProps {
  spin?: boolean;
  className?: string;
  width?: string;
  height?: string;
}

const IconLoadingAiLineColor: React.FC<IconLoadingAiLineColorProps> = ({
  spin = false,
  className = '',
  width = '1em',
  height = '1em',
}) => {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      width={width}
      height={height}
      viewBox="0 0 48 48"
      className={`${spin ? 'force-icon-loading' : ''} ${className}`}
    >
      <defs>
        <linearGradient
          x1="0"
          y1="1.95"
          x2="1.578"
          y2="1.611"
          id="svg_bb604d03a6__a"
        >
          <stop offset="10%" stopColor="#3B91FF" />
          <stop offset="50%" stopColor="#0D5EFF" />
          <stop offset="85%" stopColor="#C069FF" />
        </linearGradient>
      </defs>
      <path
        d="M24,7.63636C14.9626,7.63636,7.63636,14.9626,7.63636,24C7.63636,33.037400000000005,14.9626,40.3636,24,40.3636C33.037400000000005,40.3636,40.3636,33.037400000000005,40.3636,24L44,24C44,35.0457,35.0457,44,24,44C12.9543,44,4,35.0457,4,24C4,12.9543,12.9543,4,24,4L24,7.63636Z"
        fillRule="evenodd"
        fill="url(#svg_bb604d03a6__a)"
      />
    </svg>
  );
};

export default IconLoadingAiLineColor;
