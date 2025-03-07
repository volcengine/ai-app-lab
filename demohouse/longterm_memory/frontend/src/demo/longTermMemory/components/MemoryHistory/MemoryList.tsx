import React, { useMemo } from 'react';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import s from '@/demo/longTermMemory/components/MemoryHistory/index.module.less';
import { MemoryCard } from '@/demo/longTermMemory/components/MemoryHistory/MemoryCard';
import { useMemoryStore } from '@/demo/longTermMemory/stores/useMemoryStore';

import { Memory } from '../../types';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

type TimeGroup = {
  title: string;
  memories: Memory[];
  order: number; // For sorting groups
};

export const MemoryList = ({ memoryList }: { memoryList: Memory[] }) => {
  const { presetMemoryList } = useMemoryStore();
  const groupMemoriesByTime = (memories: Memory[]): TimeGroup[] => {
    // Sort memories by creation date (newest first)
    const sortedMemories = [...memories].sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());

    const groupsMap: Record<string, TimeGroup> = {};
    const now = dayjs();

    // Define group order for consistent sorting
    const groupOrders: Record<string, number> = {
      今天: 1,
      昨天: 2,
      '2周前更新': 3,
      '3个月前更新': 4,
      '1年前更新': 5,
      更早: 6,
    };

    sortedMemories.forEach(memory => {
      let createdDate = dayjs(memory.createdAt);

      // Check if the memory content matches any preset memory
      const matchedPresetMemory = presetMemoryList.find(presetMemory => presetMemory.content === memory.content);

      if (matchedPresetMemory) {
        // If the content matches a preset memory, use the preset memory's creation time
        createdDate = dayjs(matchedPresetMemory.createdAt);
      }

      const diffDays = now.diff(createdDate, 'day');
      const diffMonths = now.diff(createdDate, 'month');
      const diffYears = now.diff(createdDate, 'year');

      let groupTitle = '';
      let displayTime = '';

      // Determine group title based on time difference
      if (now.isSame(createdDate, 'day')) {
        groupTitle = '今天';
        // For today's memories, include HH:MM:SS
        displayTime = `记忆更新时间 ${createdDate.format('YYYY-MM-DD HH:mm:ss')}`;
      } else if (now.subtract(1, 'day').isSame(createdDate, 'day')) {
        groupTitle = '昨天';
        displayTime = `记忆更新时间 ${createdDate.format('YYYY-MM-DD HH:mm')}`;
      } else if (diffDays <= 14) {
        groupTitle = '2周前更新';
        displayTime = `记忆更新时间 ${createdDate.format('YYYY-MM-DD HH:mm')}`;
      } else if (diffMonths <= 3) {
        groupTitle = '3个月前更新';
        displayTime = `记忆更新时间 ${createdDate.format('YYYY-MM-DD HH:mm')}`;
      } else if (diffYears <= 1) {
        groupTitle = '1年前更新';
        displayTime = `记忆更新时间 ${createdDate.format('YYYY-MM-DD HH:mm')}`;
      } else {
        groupTitle = '更早';
        displayTime = `记忆更新时间 ${createdDate.format('YYYY-MM-DD HH:mm')}`;
      }

      // Create group if it doesn't exist
      if (!groupsMap[groupTitle]) {
        groupsMap[groupTitle] = {
          title: groupTitle,
          memories: [],
          order: groupOrders[groupTitle] || 999,
        };
      }

      // Add memory to group with display time
      groupsMap[groupTitle].memories.push({
        ...memory,
        displayTime,
      });
    });
    // Sort memories within each group based on preset order or creation time
    Object.values(groupsMap).forEach(group => {
      if (group.title === '今天') {
        // Sort today's memories by creation time (old first)
        group.memories.sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf());
      } else {
        // Sort other groups by preset order first, then by creation time
        group.memories.sort((a, b) => {
          const presetOrderA = presetMemoryList.findIndex(preset => preset.content === a.content);
          const presetOrderB = presetMemoryList.findIndex(preset => preset.content === b.content);
          if (presetOrderA !== -1 && presetOrderB !== -1) {
            return presetOrderA - presetOrderB;
          } else if (presetOrderA !== -1) {
            return -1;
          } else if (presetOrderB !== -1) {
            return 1;
          } else {
            return dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf();
          }
        });
      }
    });
    // Convert map to array and sort by order
    return Object.values(groupsMap).sort((a, b) => b.order - a.order);
  };

  const timeGroups = useMemo(() => groupMemoriesByTime(memoryList), [memoryList]);
  return (
    <>
      {timeGroups.map(group => (
        <div key={group.title} className={s.timeGroup}>
          <h2 className={s.timeGroupTitle}>{group.title}</h2>
          <div className={s.list}>
            {group.memories.map(memory => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
};
