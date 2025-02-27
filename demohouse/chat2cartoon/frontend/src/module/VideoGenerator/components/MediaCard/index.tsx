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

import { ReactNode, useEffect, useState } from 'react';

import { ButtonProps } from '@arco-design/web-react';
import { after } from 'lodash';
import cx from 'classnames';

import usePageVisibility from '@/hooks/usePageVisibility';

import VideoPlayer from './components/VideoPlayer';
import styles from './index.module.less';
import PromptBlock from './components/PromptBlock';
import MediaCardFooter from './components/MediaCardFooter';
import ImageBlock from './components/ImageBlock';
import EditModal from './components/EditModal';
import AudioBlock from './components/AudioBlock';
import VideoBlock from './components/VideoBlock';
interface Props {
  src: string;
  type?: 'video' | 'audio' | 'image';
  tone?: string;
  audioImg?: string;
  title?: ReactNode;
  header?: ReactNode | ((title: ReactNode) => ReactNode);
  footer?: ReactNode;
  modelInfo?: { displayName: string; modelName: string; modelVersion?: string; imgSrc: string };
  prompt?: ReactNode | string;
  editButtonProps?: ButtonProps;
  regenerateButtonProps?: ButtonProps;
  onRegenerate?: () => void;
  onPromptGenerate?: () => void;
  promptLoading?: boolean;
  onEdit?: (value?: string, tone?: string) => void;
  disabled?: boolean;
  afterLoad?: () => void;
  editWarning?: boolean;
  regenerateWarning?: boolean;
}

const MediaCard = (props: Props) => {
  const {
    src,
    audioImg,
    type,
    tone,
    title,
    header,
    footer,
    prompt,
    modelInfo,
    editButtonProps,
    regenerateButtonProps,
    onRegenerate,
    onPromptGenerate,
    promptLoading,
    onEdit,
    editWarning,
    regenerateWarning,
    disabled,
    afterLoad,
  } = props;

  const [visible, setVisible] = useState(false);
  const [videoLink, setVideoLink] = useState<string>();
  const [videoMap, setVideoMap] = useState<Record<string, string>>({});

  usePageVisibility(() => {
    if (videoLink) {
      afterLoad?.();
    }
  });

  useEffect(() => {
    if (src in videoMap) {
      setVideoLink(videoMap[src]);
      return;
    }
    setVideoLink('');
  }, [src]);

  const renderHeader = () => {
    if (header === null) {
      return null;
    }
    const titleNode = <div>{title}</div>;
    // 如果是函数
    if (typeof header === 'function') {
      return header(titleNode);
    }
    if (header) {
      return header;
    }
    return <div>{titleNode}</div>;
  };

  const renderMedia = (view?: boolean) => {
    switch (type) {
      case 'video':
        return videoLink ? (
          <VideoPlayer videoLink={videoLink} />
        ) : (
          <VideoBlock
            id={src}
            setVideoLink={value => {
              setVideoLink(value);
              setVideoMap({ ...videoMap, [src]: value });
            }}
            afterLoad={afterLoad}
            videoLink={videoLink}
            audioImg={audioImg}
          />
        );
      case 'audio':
        return <AudioBlock audioLink={src} hasRadius={view} audioImg={audioImg} />;
      case 'image':
        return view ? (
          <ImageBlock imgUrl={src} />
        ) : (
          <div className={styles.imageWrapper}>
            <ImageBlock imgUrl={src} />
          </div>
        );
      default:
        return null;
    }
  };

  const renderPrompt = () => {
    if (!prompt) {
      return null;
    }
    if (typeof prompt === 'string') {
      return <PromptBlock prompt={prompt} />;
    }
    return prompt;
  };

  const renderFooter = () => {
    if (footer === null) {
      return null;
    }
    if (footer) {
      return footer;
    }
    return (
      <div>
        <MediaCardFooter
          imgUrl={modelInfo?.imgSrc}
          modelName={modelInfo?.displayName}
          onRefresh={onRegenerate}
          onEdit={setVisible.bind(null, true)}
          disabled={disabled || !src || (type === 'video' && !videoLink)}
          editWarning={editWarning}
          regenerateWarning={regenerateWarning}
          regenerateButtonProps={regenerateButtonProps}
          editButtonProps={editButtonProps}
        />
      </div>
    );
  };

  return (
    <div className={cx(styles.wrapper, { [styles.warningBorder]: regenerateWarning || editWarning })}>
      <>{renderHeader()}</>
      <div className={styles.mediaWrapper}>{renderMedia(true)}</div>
      <>{renderPrompt()}</>
      <div style={{ width: '100%' }}>{renderFooter()}</div>
      <EditModal
        visible={visible}
        onCancel={setVisible.bind(null, false)}
        media={renderMedia()}
        modelInfo={modelInfo}
        defaultPrompt={prompt as string}
        onGenerate={onEdit} // 目前设计只能支持先编辑后生成
        onPromptGenerate={onPromptGenerate}
        promptLoading={promptLoading}
        type={type}
        tone={tone}
      />
    </div>
  );
};

export default MediaCard;
