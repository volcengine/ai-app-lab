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
import { AiOutlineClockCircle } from 'react-icons/ai';
import dayjs from 'dayjs';
import './index.css';

const weekDayMap = ['日', '一', '二', '三', '四', '五', '六'];

interface TimeDisplayProps {
  date: string;
  startTime?: string;
  endTime?: string;
}

export const TimeDisplay: React.FC<TimeDisplayProps> = ({
    date,
    startTime,
    endTime,
  }) => {
    const dateObj = dayjs(date);
    const formattedDate = `${dateObj.format('M月D日')} 星期${weekDayMap[dateObj.day()]}`;
  
    // 只有在有 startTime 时才格式化时间
    const formattedStartTime = startTime ? dayjs(`2000-01-01 ${startTime}`).format('HH:mm') : null;
    const defaultEndTime = startTime ? dayjs(`2000-01-01 ${startTime}`).add(1, 'hour').format('HH:mm:ss') : null;
    const formattedEndTime = endTime 
      ? dayjs(`2000-01-01 ${endTime}`).format('HH:mm')
      : defaultEndTime 
        ? dayjs(`2000-01-01 ${defaultEndTime}`).format('HH:mm')
        : null;
  
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 text-[#737A87]">
          <AiOutlineClockCircle className="text-[#737A87]" />
          <span>{formattedDate}</span>
        </div>
        {/* 只有在有 startTime 时才显示时间文本 */}
        {formattedStartTime && (
          <div className="text-[#737A87]">
            {formattedStartTime}-{formattedEndTime}
          </div>
        )}
      </div>
    );
  };