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

const DislikeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path 
      d="M8.5 13L8.5 16C8.5 17.2426 9.50733 18.25 10.75 18.25L13.75 11.5L13.75 3.24999L5.035 3.24999C4.28704 3.24153 3.64712 3.78545 3.535 4.52499L2.5 11.275C2.43396 11.7101 2.56233 12.1523 2.85108 12.4844C3.13987 12.8164 3.55992 13.005 4 13L8.5 13Z" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinejoin="round"
    />
    <path 
      d="M13.75 11.5818L15.7525 11.5818C16.6311 11.5973 17.3822 10.8695 17.5 9.99874L17.5 4.74875C17.3822 3.87791 16.6311 3.2332 15.7525 3.24874L13.75 3.24874L13.75 11.5818Z" 
      stroke="#4A4A4A" 
      strokeWidth="1.25" 
      strokeLinejoin="round"
    />
  </svg>
);

export default DislikeIcon;