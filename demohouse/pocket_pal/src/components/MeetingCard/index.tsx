import React from 'react';
import { TimeDisplay } from './TimeDisplay';
import './index.css';

export interface Meeting {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
}

interface MeetingCardProps {
  meeting: Meeting;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({ meeting }) => {
  return (
    <div className="rounded-xl p-6 font-['PingFang_SC'] relative">
      {/* 渐变背景图层 */}
      <div 
        className="absolute top-0 left-0 w-full h-[25px] opacity-30 z-0 overflow-hidden blur-[30px]"
        style={{
          background: `
            radial-gradient(circle, rgba(90,223,250,0.6) 60%, rgba(90,223,250,0) 60%),
            linear-gradient(to right, #0D5EFF, #8F57FF, #C069FF)
          `
        }}
      />
      
      {/* 内容层 */}
      <div className="relative z-10">
        <div className="text-[14px] font-normal text-black mb-4">已为您添加日程</div>
        <div className="bg-white rounded-lg shadow-[0_2px_6px_rgba(0,0,0,0.1)] p-4">
          <div className="flex flex-col gap-[6px]">
            <div className="text-gray-800 font-medium">{meeting.title}</div>
            <TimeDisplay 
              date={meeting.date}
              startTime={meeting.startTime}
              endTime={meeting.endTime}
            />
          </div>
        </div>
      </div>
    </div>
  );
};