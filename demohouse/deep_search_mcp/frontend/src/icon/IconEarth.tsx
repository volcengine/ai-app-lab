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

const IconEarth = (props: Props) => {
  const { width = '1em', height = '1em', className = '', spin = false } = props;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      width={width}
      height={height}
      className={`${className} ${spin ? 'force-icon-loading' : ''}`}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M24 2c12.15 0 22 9.85 22 22s-9.85 22-22 22S2 36.15 2 24 11.85 2 24 2zm-5.955 24C18.25 30.6 19.16 34.8 20.57 37.902c.708 1.557 1.497 2.73 2.262 3.442.524.487.901.657 1.168.657.267 0 .643-.17 1.168-.657.765-.712 1.554-1.885 2.262-3.442 1.41-3.102 2.32-7.302 2.525-11.9h-11.91zm-.608 14.6l.11.209-.334-.133C11.226 38.237 6.847 32.668 6.11 26h7.93c.239 5.815 1.505 10.976 3.397 14.6zM41.89 26h-7.93c-.244 5.928-1.555 11.177-3.508 14.809C36.611 38.443 41.14 32.79 41.89 26zM30.563 7.401l-.11-.21.334.133C36.775 9.763 41.153 15.333 41.89 22h-7.93c-.239-5.815-1.505-10.977-3.397-14.6zm-13.015-.21l-.12.047C11.33 9.63 6.854 15.254 6.11 22h7.93c.235-5.731 1.469-10.828 3.315-14.442l.193-.368zm5.284-.534C23.356 6.17 23.733 6 24 6l.076.004c.26.03.615.21 1.092.653.765.712 1.554 1.885 2.262 3.442 1.41 3.103 2.32 7.303 2.525 11.901h-11.91c.205-4.598 1.115-8.798 2.525-11.901.708-1.557 1.497-2.73 2.262-3.442z"
        fill="currentColor"
      />
    </svg>
  );
};

export default IconEarth;
