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

import React, { type SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  width?: string;
  height?: string;
  className?: string;
  spin?: boolean;
}

const IconIconNewWindow = (props: Props) => {
  const {
    width = '1em',
    height = '1em',
    className = '',
    spin = false,
    ...restProps
  } = props;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      width={width}
      height={height}
      className={`${className} ${spin ? 'force-icon-loading' : ''}`}
      viewBox="0 0 48 48"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...restProps}
    >
      <path
        d="M23 3.5C23.5523 3.5 24 3.94772 24 4.5V7.5C24 8.05228 23.5523 8.5 23 8.5H8.5V39.5H39.5V25C39.5 24.4477 39.9477 24 40.5 24H43.5C44.0523 24 44.5 24.4477 44.5 25V43.5C44.5 44.0523 44.0523 44.5 43.5 44.5H4.5C3.94771 44.5 3.5 44.0523 3.5 43.5V4.5C3.5 3.94771 3.94772 3.5 4.5 3.5H23Z"
        fill="currentColor"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M31.2071 3.5C30.7616 3.5 30.5385 4.03857 30.8535 4.35355L35.4746 8.97461L22.9258 21.5234C22.5353 21.9139 22.5353 22.5471 22.9258 22.9376L25.0471 25.0589C25.4377 25.4494 26.0708 25.4494 26.4614 25.0589L39.0101 12.5101L43.6464 17.1464C43.9614 17.4614 44.5 17.2383 44.5 16.7929V4C44.5 3.72386 44.2761 3.5 44 3.5H31.2071Z"
        fill="currentColor"
      />
    </svg>
  );
};

export default IconIconNewWindow;
