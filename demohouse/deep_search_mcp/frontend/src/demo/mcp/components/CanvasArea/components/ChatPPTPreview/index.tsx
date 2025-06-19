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
