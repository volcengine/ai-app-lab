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

import React, { type CSSProperties } from 'react';

interface Props {
  width?: string;
  height?: string;
  className?: string;
  style?: CSSProperties;
  spin?: boolean;
}

const IconSuccessFill = (props: Props) => {
  const {
    width = '1em',
    height = '1em',
    className = '',
    spin = false,
    style,
  } = props;

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      width={width}
      height={height}
      className={`${className} ${spin ? 'force-icon-loading' : ''}`}
      style={style}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M45 24c0-11.598-9.402-21-21-21S3 12.402 3 24s9.402 21 21 21 21-9.402 21-21zm-13.671-6.816l1.149.964a1.5 1.5 0 01.184 2.113l-9.021 10.745-1.028 1.237a1.5 1.5 0 01-2.113.195l-.011-.01-.012-.01-2.11-1.827-.148-.125.002-.002-3.711-3.214a1.5 1.5 0 01-.152-2.116l.02-.022 1.006-1.118a1.5 1.5 0 012.093-.133l3.65 3.142 8.088-9.634a1.501 1.501 0 012.114-.185z"
        fill="#000"
      />
    </svg>
  );
};

export default IconSuccessFill;
