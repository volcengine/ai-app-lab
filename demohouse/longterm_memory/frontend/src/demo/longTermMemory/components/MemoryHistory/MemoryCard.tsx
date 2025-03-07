import React, { useMemo } from 'react';

import dayjs from 'dayjs';

import { useMemoryStore } from '@/demo/longTermMemory/stores/useMemoryStore';

import s from './index.module.less';
import { Memory } from '../../types';
interface MemoryCardProps {
  memory: Memory;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({ memory }) => {
  const { presetMemoryList } = useMemoryStore();
  const createdDate = useMemo(() => {
    let d = dayjs(memory.createdAt);

    // Check if the memory content matches any preset memory
    const matchedPresetMemory = presetMemoryList.find(presetMemory => presetMemory.content === memory.content);

    if (matchedPresetMemory) {
      // If the content matches a preset memory, use the preset memory's creation time
      d = dayjs(matchedPresetMemory.createdAt);
    }
    return d;
  }, [memory]);

  return (
    <div className={s.card}>
      <svg className={s.bg} xmlns="http://www.w3.org/2000/svg" width="67" height="70" viewBox="0 0 67 70" fill="none">
        <g clipPath="url(#clip0_813_4362)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M29.2845 11.5274C30.9086 10.9829 32.5825 10.6296 34.2707 10.4701C35.695 10.3356 36.8249 11.548 36.7708 12.9777C36.7177 14.3783 35.544 15.4566 34.1537 15.6341C33.0581 15.7739 31.9728 16.0217 30.9151 16.3763C28.1512 17.303 25.6799 18.9246 23.757 21.0698C21.8344 23.2148 20.5316 25.8036 19.9789 28.5651C19.4263 31.3264 19.6433 34.1621 20.605 36.7792C21.5668 39.3964 23.2398 41.7036 25.4536 43.4602C27.6677 45.2173 30.3435 46.3607 33.2051 46.7666C34.1907 46.9066 35.0015 47.5861 35.2948 48.5179L36.9574 53.8007L47.996 50.3267L46.3334 45.0439C46.0394 44.1097 46.317 43.0856 47.0488 42.4066C47.4167 42.0651 48.0375 41.3503 48.6464 40.6132C49.5633 39.5033 51.1613 39.1826 52.4004 39.9155C53.6944 40.6809 54.0867 42.2949 53.1129 43.4404C52.5646 44.0853 52.0392 44.6598 51.7879 44.9317L53.1513 49.2638C53.5196 50.4342 53.3875 51.7015 52.7968 52.7851C52.2065 53.8674 51.2076 54.6791 50.0248 55.0513L37.9997 58.8357C36.817 59.2079 35.5334 59.1146 34.4298 58.5654C33.3247 58.0155 32.4908 57.0522 32.1225 55.8819L30.7578 51.5457C27.597 50.8484 24.6456 49.4559 22.1344 47.4634C19.1953 45.1309 16.9678 42.0623 15.6862 38.5748C14.4045 35.0872 14.1171 31.312 14.8515 27.6425C15.5858 23.9733 17.3143 20.5458 19.8528 17.7136C22.3911 14.8817 25.6479 12.7467 29.2845 11.5274ZM43.3558 15.0438C43.2636 13.2603 45.6017 12.5184 46.5548 14.0287L47.5012 15.5285C48.8339 17.6406 51.199 18.8733 53.6937 18.7563L55.4652 18.6732C57.2491 18.5895 57.9799 20.9311 56.4651 21.877L54.9887 22.7988C52.8603 24.1278 51.6154 26.5024 51.733 29.0088L51.8142 30.7406C51.8979 32.5245 49.5563 33.2553 48.6104 31.7405L47.7097 30.298C46.3745 28.1596 43.9844 26.9138 41.4668 27.0439L39.7684 27.1316C37.9849 27.2238 37.2429 24.8857 38.7533 23.9326L40.2194 23.0075C42.3415 21.6684 43.5751 19.2879 43.4456 16.782L43.3558 15.0438ZM38.6112 61.2773C37.2876 61.6939 36.5759 63.1785 36.9925 64.5022C37.4093 65.8266 38.7973 66.4877 40.1217 66.0709L52.1061 62.2993C53.43 61.8826 54.1654 60.4717 53.7488 59.1478C53.3322 57.824 51.9212 57.0885 50.5973 57.5052L38.6112 61.2773Z"
            fill="url(#paint0_linear_813_4362)"
          />
        </g>
        <defs>
          <linearGradient
            id="paint0_linear_813_4362"
            x1="30.7174"
            y1="11.0724"
            x2="47.3138"
            y2="63.8075"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#E0E3FF" stopOpacity="0.7" />
            <stop offset="1" stopColor="#E0E3FF" stopOpacity="0.3" />
          </linearGradient>
          <clipPath id="clip0_813_4362">
            <rect width="60.3113" height="60.3113" fill="white" transform="translate(0 18.1052) rotate(-17.4694)" />
          </clipPath>
        </defs>
      </svg>
      <div className={s.text}>&quot;{memory.content}&quot;</div>
      <div className={s.bottom}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <g clipPath="url(#clip0_788_6390)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2ZM8 3.33333C5.42267 3.33333 3.33333 5.42267 3.33333 8C3.33333 10.5773 5.42267 12.6667 8 12.6667C10.5773 12.6667 12.6667 10.5773 12.6667 8C12.6667 5.42267 10.5773 3.33333 8 3.33333ZM8.33333 4.66667C8.51743 4.66667 8.66667 4.81591 8.66667 5V7.33333H11C11.1841 7.33333 11.3333 7.48257 11.3333 7.66667V8.33333C11.3333 8.51743 11.1841 8.66667 11 8.66667H7.66667C7.48257 8.66667 7.33333 8.51743 7.33333 8.33333V5C7.33333 4.81591 7.48257 4.66667 7.66667 4.66667H8.33333Z"
              fill="#73779F"
            />
          </g>
          <defs>
            <clipPath id="clip0_788_6390">
              <rect width="16" height="16" fill="white" />
            </clipPath>
          </defs>
        </svg>
        <div>记忆更新时间</div>
        <div>{dayjs(createdDate).format('YYYY-MM-DD HH:mm:ss')}</div>
      </div>
    </div>
  );
};
