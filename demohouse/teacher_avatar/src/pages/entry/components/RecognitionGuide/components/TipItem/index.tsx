import React from 'react';

interface TipItemProps {
  index: number;
  title: string;
  correctImage: string;
  incorrectImage: string;
}

const TipItem: React.FC<TipItemProps> = ({ index, title, correctImage, incorrectImage }) => (
  <div className="mb-[16px]">
    <div className="flex items-center mb-[8px]">
      <div className="w-[20px] h-[20px] bg-[#F1F3F5] rounded-[4px] flex items-center justify-center text-[#0C0D0E] font-medium mr-[6px]">
        {index}
      </div>
      <h3 className="text-[16px] font-bold">{title}</h3>
    </div>

    <div className="flex space-x-3">
      {/* 正确示例 */}
      <div className="relative overflow-hidden">
        <img src={correctImage} alt="正确示例" className="w-full h-auto" />
      </div>

      {/* 错误示例 */}
      <div className="relative overflow-hidden">
        <img src={incorrectImage} alt="错误示例" className="w-full h-auto" />
      </div>
    </div>
  </div>
);

export default TipItem;
