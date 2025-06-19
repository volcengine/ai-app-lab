import React, { useEffect, useState } from 'react';

import { IconLink } from '@arco-design/web-react/icon';

import { useCopy } from '@/demo/mcp/hooks/useCopy';
import type { Event } from '@/demo/mcp/types/event';

import { IconIconNewWindow } from '@/icon';
import ChatPPTPreview from '../../../ChatPPTPreview';
import PlayerBroadcast from '../../../PlayerBroadcast';
import BaseContent from '../../baseContent';
import styles from './index.module.less';

interface ChatPPTProps {
  data: Event;
}

const ChatPPT = ({ data }: ChatPPTProps) => {
  const [previewURL, setPreviewURL] = useState<string>('');
  const [editURL, setEditURL] = useState<string>('');
  const [downloadURL, setDownloadURL] = useState<string>('');
  const { copy } = useCopy(previewURL);

  useEffect(() => {
    if (data.result?.metadata?.preview_url && !previewURL) {
      setPreviewURL(data.result.metadata.preview_url);
    }
    if (!data.result?.metadata?.preview_url && data.id && !previewURL) {
      setPreviewURL(
        `https://chatppt.yoo-ai.com/generateResults?generateID=${data.id}`,
      );
    }
    if (data.history) {
      // 从 history 中找到 download_url、edit_url
      data.history?.forEach?.(item => {
        if (!item.metadata || item.status !== 'completed') {
          return;
        }
        if (item.metadata?.preview_url && !previewURL) {
          setPreviewURL(data.result.metadata.preview_url);
        }
        if (item.metadata.download_url) {
          setDownloadURL(item.metadata.download_url);
        }
        if (item.metadata.url) {
          setEditURL(item.metadata.url);
        }
      });
    }
  }, [data]);

  return (
    <BaseContent
      header={
        <>
          <PlayerBroadcast
            type={data.type}
            suffix={
              data.result?.metadata?.state_description ? (
                <span>{data.result.metadata.state_description}</span>
              ) : null
            }
          />
          <div className={styles.btnOperate}>
            <IconIconNewWindow
              className={styles.btn}
              onClick={() => {
                window.open(previewURL, '_blank');
              }}
            />
            <IconLink
              className={styles.btn}
              onClick={() => {
                // 复制
                copy();
              }}
            />
          </div>
        </>
      }
    >
      {previewURL ? (
        <ChatPPTPreview
          previewURL={previewURL}
          editURL={editURL}
          downloadURL={downloadURL}
        />
      ) : null}
    </BaseContent>
  );
};

export default ChatPPT;
