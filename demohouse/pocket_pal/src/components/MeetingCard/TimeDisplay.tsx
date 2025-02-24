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