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

import { useMemo, useCallback, useRef } from 'react';

import { useChatStore } from '@/demo/longTermMemory/stores/useChatStore';
import { useMemoryStore } from '@/demo/longTermMemory/stores/useMemoryStore';
import { startReasoning, listMemories } from '@/demo/longTermMemory/api';

export const useMemoryUpdate = () => {
  const { getCurrentRoundChatList, chatList, isReasoning: isChatReasoning } = useChatStore();
  const {
    presetMemoryList,
    initPresetMemoryList,
    reasonStartTime,
    reasonEndTime,
    setReasonStartTime,
    setReasonEndTime,
    memoryList,
    setMemoryList,
    reasoningContent,
    updateReasoningContent,
    isReasoning,
    setIsReasoning,
  } = useMemoryStore();

  // todo 优化
  // 是否可以更新
  // 1. 存在可以上传的对话 pair 且都finish
  const canUpdate = useMemo(() => {
    const msgList = getCurrentRoundChatList();

    return !isChatReasoning && msgList.length > 1;
  }, [getCurrentRoundChatList, chatList.length, isChatReasoning]);

  const accRef = useRef('');

  const handleReasoningResponse = useCallback(
    (data: string) => {
      try {
        const apiResponse: any = JSON.parse(data);
        const { choices = [] } = apiResponse;

        const content = choices?.[0]?.delta?.content ?? '';
        const reasoningContent = choices?.[0]?.delta?.reasoning_content ?? '';
        if (content) {
          accRef.current = accRef.current + content;
        }
        if (reasoningContent) {
          accRef.current = accRef.current + reasoningContent;
        }

        updateReasoningContent(accRef.current);
      } catch (error) {
        console.error('Error parsing API response:', error);
      }
    },
    [updateReasoningContent],
  );

  const handleReasoningEnd = useCallback(() => {
    accRef.current = '';
    setIsReasoning(false);
    setReasonEndTime(Date.now());
    setTimeout(() => {
      listMemories(setMemoryList);
    }, 2000);
  }, [setIsReasoning, setReasonEndTime, setMemoryList]);

  const handleUpdate = useCallback(() => {
    setIsReasoning(true);
    setReasonEndTime(0);
    setReasonStartTime(Date.now());
    updateReasoningContent('');
    startReasoning(getCurrentRoundChatList(), handleReasoningResponse, handleReasoningEnd);
  }, [
    setIsReasoning,
    setReasonEndTime,
    setReasonStartTime,
    updateReasoningContent,
    getCurrentRoundChatList,
    handleReasoningResponse,
    handleReasoningEnd,
  ]);

  return {
    presetMemoryList,
    initPresetMemoryList,
    setMemoryList,
    reasonStartTime,
    reasonEndTime,
    isReasoning,
    reasoningContent,
    canUpdate,
    memoryList,
    handleUpdate,
  };
};
