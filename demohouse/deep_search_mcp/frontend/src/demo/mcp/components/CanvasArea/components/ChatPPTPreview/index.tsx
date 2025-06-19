import React, { useRef } from 'react';

import { Button } from '@arco-design/web-react';
import { IconDownload, IconEdit } from '@arco-design/web-react/icon';

import styles from './index.module.less';

interface ChatPPTPreviewProps {
  previewURL: string;
  editURL?: string;
  downloadURL?: string;
}

const ChatPPTPreview = ({
  previewURL,
  editURL,
  downloadURL,
}: ChatPPTPreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className={styles.iframeWrapper}>
      <iframe
        ref={iframeRef}
        className={styles.iframe}
        src={previewURL}
        scrolling="no"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
      <div className={styles.mask}>
        <div className={styles.btnOperate}>
          {Boolean(editURL) && (
            <Button
              className={styles.editBtn}
              onClick={() => {
                window.open(editURL, '_blank');
              }}
              icon={<IconEdit />}
            >
              在线编辑
            </Button>
          )}
          {Boolean(downloadURL) && (
            <Button
              className={styles.downloadBtn}
              href={downloadURL}
              icon={<IconDownload />}
            >
              文件下载
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPPTPreview;
