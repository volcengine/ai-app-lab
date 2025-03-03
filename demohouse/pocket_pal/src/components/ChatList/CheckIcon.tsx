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

const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path 
      d="M0.99707 7.99821C0.99707 11.8643 4.13052 14.998 7.99723 14.998C11.8633 14.998 14.9971 11.8643 14.9971 7.99821C14.9971 4.13182 11.8633 0.998047 7.99723 0.998047C4.13084 0.998047 0.997708 4.13182 0.99707 7.99821ZM10.8793 5.77266L11.5877 6.48137C11.6161 6.50984 11.6388 6.54365 11.6542 6.58086C11.6696 6.61806 11.6775 6.65795 11.6775 6.69822C11.6775 6.7385 11.6696 6.77839 11.6542 6.81559C11.6388 6.8528 11.6161 6.88661 11.5877 6.91508L7.45263 11.0504C7.42416 11.0789 7.39036 11.1015 7.35315 11.1169C7.31594 11.1324 7.27606 11.1403 7.23578 11.1403C7.1955 11.1403 7.15562 11.1324 7.11841 11.1169C7.0812 11.1015 7.0474 11.0789 7.01893 11.0504L4.4065 8.43799C4.378 8.40952 4.3554 8.37571 4.33998 8.3385C4.32456 8.30129 4.31662 8.26141 4.31662 8.22113C4.31662 8.18086 4.32456 8.14097 4.33998 8.10377C4.3554 8.06656 4.378 8.03275 4.4065 8.00428L5.11489 7.2962C5.14337 7.26766 5.17719 7.24502 5.21443 7.22957C5.25167 7.21412 5.29159 7.20617 5.3319 7.20617C5.37222 7.20617 5.41214 7.21412 5.44938 7.22957C5.48662 7.24502 5.52044 7.26766 5.54892 7.2962L7.23562 8.98195L10.4459 5.77266C10.5034 5.71521 10.5813 5.68294 10.6626 5.68294C10.7438 5.68294 10.8218 5.71521 10.8793 5.77266Z" 
      fill="#704DFF"
    />
  </svg>
);

export default CheckIcon;