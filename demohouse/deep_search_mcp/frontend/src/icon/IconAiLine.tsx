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

import React, { type SVGProps, type CSSProperties } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  width?: string;
  height?: string;
  className?: string;
  style?: CSSProperties;
  spin?: boolean;
}

const IconAiLine = (props: Props) => {
  const {
    width = '1em',
    height = '1em',
    className = '',
    spin = false,
    style,
    ...restProps
  } = props;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      width={width}
      height={height}
      className={`${className} ${spin ? 'force-icon-loading' : ''}`}
      style={style}
      viewBox="0 0 48 48"
      {...restProps}
    >
      <defs>
        <linearGradient
          x1="0"
          y1="1.95"
          x2="1.578"
          y2="1.611"
          id="svg_ed93eab349__a"
        >
          <stop offset="10%" stop-color="#3B91FF" />
          <stop offset="50%" stop-color="#0D5EFF" />
          <stop offset="85%" stop-color="#C069FF" />
        </linearGradient>
      </defs>
      <path
        d="M38.7744,9.19462C39.6456,10.0484,39.6456,11.5199,38.8107,12.3555L35.0354,16.1704C34.1824,17.0424,32.712199999999996,17.0424,31.8773,16.206699999999998C31.0061,15.3347,31.0061,13.8814,31.841,13.0276L35.6163,9.23094C36.4693,8.37714,37.9395,8.340810000000001,38.7744,9.19462ZM9.91531,42.3112C8.82644,43.4194,6.97501,43.4013,5.90419,42.3112C4.83311,41.2031,4.83311,39.4048,5.90419,38.2966L23.1288,20.9299C24.2178,19.8399,26.0692,19.8399,27.14,20.9299C28.2291,22.038,28.2109,23.8365,27.14,24.9264L9.91531,42.3112ZM38.847,38.7508C39.6819,37.915,39.6638,36.4436,38.8107,35.5898L35.0173,31.8114C34.1642,30.9757,32.694,30.9937,31.841,31.8476C31.0061,32.7014,31.0242,34.1548,31.8773,35.0086L35.6707,38.8053C36.5238,39.641,37.994,39.6227,38.847,38.7508ZM16.1772,13.0276C17.0122,13.8814,17.0122,15.3347,16.1408,16.206699999999998C15.306,17.0424,13.8359,17.0424,12.9828,16.1704L9.18939,12.3737C8.3363,11.538,8.35435,10.066600000000001,9.2255,9.19462C10.060500000000001,8.340810000000001,11.5307,8.37714,12.3838,9.23094L16.1772,13.0276ZM24,3C22.7839,3,21.7675,4.0354600000000005,21.7675,5.25259L21.7675,10.793199999999999C21.7675,12.0104,22.7839,13.0276,24,13.0276C25.2161,13.0276,26.2507,12.0104,26.2507,10.793199999999999L26.2507,5.25259C26.2507,4.0354600000000005,25.2161,3,24,3ZM45,23.9999C45,22.7828,43.9836,21.7655,42.7675,21.7655L37.2316,21.7655C36.0156,21.7655,34.981,22.7828,34.981,23.9999C34.981,25.2171,36.0156,26.2344,37.2316,26.2344L42.7675,26.2344C43.9836,26.2344,45,25.2171,45,23.9999ZM3,23.9999C3,25.2171,4.0347100000000005,26.2344,5.25076,26.2344L10.7684,26.2344C11.9845,26.2344,13.0192,25.2171,13.0192,23.9999C13.0192,22.7828,11.9845,21.7655,10.7684,21.7655L5.25076,21.7655C4.0347100000000005,21.7655,3,22.7828,3,23.9999ZM24,34.9722C22.7839,34.9722,21.7675,36.0078,21.7675,37.2249L21.7675,42.7473C21.7675,43.9644,22.7839,45,24,45C25.2161,45,26.2507,43.9644,26.2507,42.7473L26.2507,37.2249C26.2507,36.0078,25.2161,34.9722,24,34.9722Z"
        fill-rule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
};

export default IconAiLine;
