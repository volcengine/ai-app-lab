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

import { usePlanningChartVisibleStore } from '@/demo/mcp/store/ChatConfigStore/usePlanningChartVisible';

export const CloseButton = () => {
  const { setVisible } = usePlanningChartVisibleStore();
  const handleCLose = () => {
    setVisible(false);
  };
  return (
    <svg
      onClick={handleCLose}
      className="cursor-pointer"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.00016 9.33337C6.17697 9.33337 6.34654 9.40361 6.47157 9.52864C6.59659 9.65366 6.66683 9.82323 6.66683 10V14.3334C6.66683 14.4218 6.63171 14.5066 6.5692 14.5691C6.50669 14.6316 6.4219 14.6667 6.3335 14.6667H5.66683C5.57842 14.6667 5.49364 14.6316 5.43113 14.5691C5.36861 14.5066 5.3335 14.4218 5.3335 14.3334V10.6667H1.66683C1.57842 10.6667 1.49364 10.6316 1.43113 10.5691C1.36862 10.5066 1.3335 10.4218 1.3335 10.3334V9.66671C1.3335 9.5783 1.36862 9.49352 1.43113 9.431C1.49364 9.36849 1.57842 9.33337 1.66683 9.33337H6.00016ZM10.3335 1.33337C10.4219 1.33337 10.5067 1.36849 10.5692 1.43101C10.6317 1.49352 10.6668 1.5783 10.6668 1.66671V5.33337H14.3335C14.4219 5.33337 14.5067 5.36849 14.5692 5.431C14.6317 5.49352 14.6668 5.5783 14.6668 5.66671V6.33337C14.6668 6.42178 14.6317 6.50656 14.5692 6.56908C14.5067 6.63159 14.4219 6.66671 14.3335 6.66671H10.0002C9.82335 6.66671 9.65378 6.59647 9.52876 6.47144C9.40373 6.34642 9.3335 6.17685 9.3335 6.00004V1.66671C9.3335 1.5783 9.36861 1.49352 9.43113 1.43101C9.49364 1.36849 9.57842 1.33337 9.66683 1.33337H10.3335Z"
        fill="#1A1815"
      />
    </svg>
  );
};
