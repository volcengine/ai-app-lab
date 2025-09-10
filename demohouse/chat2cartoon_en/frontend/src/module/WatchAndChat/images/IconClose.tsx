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

import clsx from 'classnames';

export const IconClose = ({ onClick, className }: { className: string; onClick: () => void }) => (
  <svg
    className={clsx('cursor-pointer', className)}
    onClick={onClick}
    width="40"
    height="40"
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g filter="url(#filter0_b_497_183572)">
      <circle cx="20" cy="20" r="20" fill="black" fillOpacity="0.59" />
    </g>
    <path
      d="M25.0065 13.8437L26.1556 14.9928C26.5182 15.3555 26.5182 15.9434 26.1556 16.3061L22.461 20.0001L26.1556 23.6945C26.5182 24.0572 26.5182 24.6451 26.1556 25.0078L25.0065 26.1569C24.6438 26.5195 24.0559 26.5195 23.6932 26.1569L19.9978 22.4609L16.3061 26.1555C15.9435 26.5182 15.3555 26.5182 14.9929 26.1555L13.8438 25.0064C13.4811 24.6438 13.4811 24.0558 13.8438 23.6932L17.5346 20.0001L13.8438 16.3074C13.4811 15.9448 13.4811 15.3568 13.8438 14.9941L14.9929 13.845C15.3555 13.4824 15.9435 13.4824 16.3061 13.845L19.9978 17.5369L23.6932 13.8437C24.0559 13.4811 24.6438 13.4811 25.0065 13.8437Z"
      fill="white"
    />
    <defs>
      <filter
        id="filter0_b_497_183572"
        x="-10"
        y="-10"
        width="60"
        height="60"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feGaussianBlur in="BackgroundImageFix" stdDeviation="5" />
        <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_497_183572" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_backgroundBlur_497_183572" result="shape" />
      </filter>
    </defs>
  </svg>
);
