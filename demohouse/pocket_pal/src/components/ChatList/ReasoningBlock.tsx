import React, { useState } from 'react';
import { BsCheckCircleFill } from 'react-icons/bs';
import { IoChevronDownOutline } from 'react-icons/io5';
import SearchIcon from './SearchIcon';
import CheckIcon from './CheckIcon';
import CollapseIcon from './CollapseIcon';

interface ReasoningBlockProps {
  content: string;
  thinkingTime?: number;
  status?: 'searching' | 'completed';
}

const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ content, thinkingTime = 0, status = 'searching' }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="mt-2 mb-4 bg-[#F3F5FF] rounded-2xl py-[13px] px-4 w-full relative">
      {/* 添加左侧竖线 */}
      <div className="absolute left-4 top-[52px] bottom-4 w-[1px] bg-[#E6EDFC] rounded-full" />
      
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-2">
          {status === 'searching' ? (
            <SearchIcon />
          ) : (
            <CheckIcon />
          )}
          <span className={`${status === 'searching' ? 'text-[#292C30] text-[13px] font-normal' : 'text-[#0C0D0E] text-[16px] font-medium'}`}>
            {status === 'searching' ? '思考中...' : `已深度思考 ${thinkingTime > 0 ? `(耗时${thinkingTime}s)` : ''}`}
          </span>
        </div>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-full transition-transform duration-200"
        >
          <CollapseIcon 
            className={`text-[#666] text-lg transform transition-transform duration-200 ${
              !isCollapsed ? 'rotate-180' : ''
            }`} 
          />
        </button>
      </div>
      
      {!isCollapsed && (
        <div className="text-[#43424B] text-[13px] leading-[25px] whitespace-pre-wrap pl-[13px]">
          {content}
        </div>
      )}
    </div>
  );
};

export default ReasoningBlock;