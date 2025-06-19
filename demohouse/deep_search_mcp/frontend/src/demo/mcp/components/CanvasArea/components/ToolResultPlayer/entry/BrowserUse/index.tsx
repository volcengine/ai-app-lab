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

import React, { useEffect, useRef, useState } from 'react';

import { throttle } from 'lodash';
import { Button, Image } from '@arco-design/web-react';

import { ReactComponent as IconControl } from '@/demo/mcp/assets/icon_control.svg';
import { Event } from '@/demo/mcp/types/event';
import { useConfigStore } from '@/demo/mcp/store/ConfigStore/useConfigStore';
import { useIndexedDB } from '@/demo/mcp/hooks/useIndexedDB';

import BaseContent from '../../baseContent';
import PlayerBroadcast from '../../../PlayerBroadcast';
import { BrowserUseLive } from '../../../BrowserUseLive';
import styles from './index.module.less';

interface BrowserUseProps {
  data: Event;
}

const BrowserUse = ({ data }: BrowserUseProps) => {
  const { accountId, userId, botId } = useConfigStore();
  const dbInstance = useIndexedDB(`${accountId}_${userId}_${botId}`);
  const wsURLRef = useRef<string>('');

  const [wsURL, setWsURL] = useState<string>('');
  const [isHITL, setIsHITL] = useState<boolean>(false);
  const [currentScreencastFrame, setCurrentScreencastFrame] = useState<string[]>([]);
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);

  const throttledSaveScreencastFrame = throttle(
    async (screencastFrame: string) => {
      if (!dbInstance) {
        return;
      }

      const item = await dbInstance.getItem();
      if (!item) {
        return;
      }

      const { screencastFrame: oldScreencastFrame = {} } = item;
      const newScreencastFrameById = [...(oldScreencastFrame?.[data.id] || []), screencastFrame];
      setCurrentScreencastFrame(newScreencastFrameById);

      try {
        await dbInstance.putItem({
          screencastFrame: { ...oldScreencastFrame, [data.id]: newScreencastFrameById },
        });
      } catch (error) {
        console.error(error);
      }
    },
    1500,
    { leading: true, trailing: false },
  ); // 1.5秒节流，立即执行第一次

  useEffect(() => {
    if (!wsURLRef.current && data.status !== 'finish') {
      const { history = [] } = data;
      history.forEach(item => {
        if (item.url) {
          // 保证 url 是 wss
          let wsURL = item.url;
          if (!wsURL.startsWith('wss://')) {
            wsURL = wsURL.replace('ws://', 'wss://');
          }
          wsURLRef.current = wsURL;
          setWsURL(wsURL);
        }
      });
    }
  }, [data]);

  useEffect(() => {
    if (data.id) {
      (async () => {
        if (!dbInstance) {
          return;
        }
        const item = await dbInstance.getItem();
        if (!item) {
          return;
        }
        const { screencastFrame: oldScreencastFrame = {} } = item;
        setCurrentScreencastFrame(oldScreencastFrame?.[data.id] || []);
      })();
    }
  }, [data.id, dbInstance]);

  return (
    <BaseContent
      header={
        <>
          <PlayerBroadcast type={data.type} />
          {data.status !== 'finish' && Boolean(wsURL) && (
            <Button
              shape="round"
              size="small"
              onClick={() => {
                setIsHITL(true);
              }}
              icon={<IconControl style={{ marginBottom: -1 }} />}
            >
              手动接管
            </Button>
          )}
        </>
      }
    >
      {wsURL ? (
        <BrowserUseLive
          wsURL={wsURL}
          data={data}
          isHITL={isHITL}
          setIsHITL={setIsHITL}
          onSaveScreencastFrame={throttledSaveScreencastFrame}
        />
      ) : (
        <>
          {currentScreencastFrame.length > 0 && (
            <div className={styles.imageContainer}>
              <img
                src={currentScreencastFrame[currentScreencastFrame.length - 1]}
                onClick={() => setPreviewVisible(true)}
              />
              <Image.PreviewGroup
                srcList={currentScreencastFrame}
                visible={previewVisible}
                onVisibleChange={setPreviewVisible}
                defaultCurrent={currentScreencastFrame.length - 1}
              />
            </div>
          )}
        </>
      )}
    </BaseContent>
  );
};

export default BrowserUse;
