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

import React, { useEffect, useState } from 'react';

import { Event, EventType } from '@/demo/mcp/types/event';

import { useCanvasStore } from '../../../../store/CanvasStore';
import styles from './index.module.less';
import PlayerController from '../PlayerController';
import ErrorNotice from '../ErrorNotice';
import Knowledge from './entry/Knowledge';
import LinkReader from './entry/LinkReader';
import Python from './entry/Python';
import WebSearch from './entry/WebSearch';
import Common from './entry/Common';
import BrowserUse from './entry/BrowserUse';
import ChatPPT from './entry/ChatPPT';
import BaseContent from './baseContent';
import PlayerBroadcast from '../PlayerBroadcast';

const ToolResultPlayer = () => {
  const data = useCanvasStore(state => state.data);
  const currentIndex = useCanvasStore(state => state.currentIndex);
  const currentSessionId = useCanvasStore(state => state.currentSessionId);
  const setCurrentIndex = useCanvasStore(state => state.setCurrentIndex);
  const currentType = useCanvasStore(state => state.currentType);

  // 获取当前类型的索引列表
  const getFilteredIndices = () => {
    if (currentType === 'follow') {
      return Array.from({ length: data[currentSessionId].length }, (_, i) => i);
    }
    return data[currentSessionId]
      .map((item, index) => (item.type === currentType ? index : -1))
      .filter(index => index !== -1);
  };

  const filteredIndices = getFilteredIndices();
  const currentFilteredIndex = filteredIndices.indexOf(currentIndex);
  const totalFilteredItems = filteredIndices.length - 1;

  const [currentResult, setCurrentResult] = useState<Event>();

  useEffect(() => {
    if (data[currentSessionId].length === 0) {
      setCurrentResult(undefined);
      return;
    }

    setCurrentResult(data[currentSessionId][currentIndex]);
  }, [data, currentIndex, currentSessionId]);

  const renderContent = () => {
    if (!currentResult) {
      console.log('currentResult', currentSessionId, currentIndex);
      return null;
    }

    if (currentResult.result?.success === false) {
      return (
        <BaseContent header={<PlayerBroadcast type={currentResult.type} />}>
          <ErrorNotice />
        </BaseContent>
      );
    }

    switch (currentResult.type) {
      case EventType.WebSearch: {
        return <WebSearch key={currentResult.id} data={currentResult} />;
      }
      case EventType.LinkReader: {
        return <LinkReader key={currentResult.id} data={currentResult} />;
      }
      case EventType.PythonExecutor: {
        return <Python key={currentResult.id} data={currentResult} />;
      }
      case EventType.KnowledgeBaseSearch: {
        return <Knowledge key={currentResult.id} data={currentResult} />;
      }
      case EventType.BrowserUse: {
        return <BrowserUse key={currentResult.id} data={currentResult} />;
      }
      case EventType.ChatPPT: {
        return <ChatPPT key={currentResult.id} data={currentResult} />;
      }
      default: {
        return <Common key={currentResult.id} data={currentResult} />;
      }
    }
  };

  return (
    <div className={styles.toolResultPlayer}>
      <div className={styles.contentWrapper}>{renderContent()}</div>
      <div className={styles.footer}>
        <PlayerController
          current={currentFilteredIndex}
          total={totalFilteredItems}
          updateCurrent={newIndex => setCurrentIndex(filteredIndices[newIndex])}
        />
      </div>
    </div>
  );
};

export default ToolResultPlayer;
