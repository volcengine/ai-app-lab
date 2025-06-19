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

import React from 'react';

interface Props {
  width?: string;
  height?: string;
  className?: string;
  spin?: boolean;
}

const IconTerminal = (props: Props) => {
  const { width = '1em', height = '1em', className = '', spin = false } = props;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      width={width}
      height={height}
      className={`${className} ${spin ? 'force-icon-loading' : ''}`}
      viewBox="0 0 48 48"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clip-path="url(#svg_ede997b0ca__clip0_7458_35662)" fill="currentColor">
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M8 10V38H40V10H8ZM6 6C4.89543 6 4 6.89543 4 8V40C4 41.1046 4.89543 42 6 42H42C43.1046 42 44 41.1046 44 40V8C44 6.89543 43.1046 6 42 6H6Z"
        />
        <path d="M13.6261 16.9603L12.3716 18.1244C11.9667 18.5 11.9431 19.1327 12.3187 19.5376L12.324 19.5432L12.3368 19.5566L16.7869 24.0845L12.3368 28.6123C11.9507 29.0072 11.9577 29.6403 12.3526 30.0265L12.3716 30.0446L13.6261 31.2086C14.0212 31.5752 14.6357 31.5627 15.0156 31.1804L21.3723 24.7893C21.7598 24.3993 21.7598 23.7696 21.3723 23.3796L15.0156 16.9885C14.6357 16.6062 14.0212 16.5937 13.6261 16.9603Z" />
        <path d="M24.9998 27.0005C24.4475 27.0005 23.9998 27.4482 23.9998 28.0005V30.0005C23.9998 30.5528 24.4475 31.0005 24.9998 31.0005H33.9998C34.5521 31.0005 34.9998 30.5528 34.9998 30.0005V28.0005C34.9998 27.4482 34.5521 27.0005 33.9998 27.0005H24.9998Z" />
      </g>
      <defs>
        <clipPath id="svg_ede997b0ca__clip0_7458_35662">
          <path fill="currentColor" d="M0 0H48V48H0z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default IconTerminal;
