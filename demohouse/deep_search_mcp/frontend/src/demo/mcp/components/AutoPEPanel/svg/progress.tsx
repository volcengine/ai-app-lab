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

import { type SVGProps } from 'react';

export const PromptGeneratePropgress = (props: SVGProps<SVGSVGElement>) => (
  <svg width="232" height="8" viewBox="0 0 232 8" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="231" height="7" rx="3.5" fill="#F6F8FA" stroke="#EAEDF1" />
    <rect x="1.3645" y="2" width="148.753" height="4" rx="2" fill="url(#paint0_linear_2890_36630)" />
    <defs>
      <linearGradient
        id="paint0_linear_2890_36630"
        x1="1.3645"
        y1="4"
        x2="150.117"
        y2="3.99999"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#70A0FF" />
        <stop offset="1" stopColor="#8870FF" />
      </linearGradient>
    </defs>
  </svg>
);
