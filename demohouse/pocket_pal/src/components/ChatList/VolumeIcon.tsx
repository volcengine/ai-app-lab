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

const VolumeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M10.0001 3.25V18.25C7.08341 18.25 4.91612 14.433 4.91612 14.433H2.50008C2.03984 14.433 1.66675 14.0599 1.66675 13.5996V7.83783C1.66675 7.37758 2.03984 7.0045 2.50008 7.0045H4.91612C4.91612 7.0045 7.08341 3.25 10.0001 3.25Z" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinejoin="round"
    />
    <path 
      d="M13.3333 7C13.5929 7.23188 13.8283 7.49154 14.035 7.7745C14.641 8.60433 14.9999 9.63429 14.9999 10.75C14.9999 11.856 14.6472 12.8778 14.0507 13.7039C13.8403 13.9952 13.5995 14.2622 13.3333 14.5" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M14.2646 17.909C16.7012 16.4547 18.333 13.7921 18.333 10.7483C18.333 7.75185 16.7515 5.12477 14.3776 3.65625" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinecap="round"
    />
  </svg>
);

export default VolumeIcon;