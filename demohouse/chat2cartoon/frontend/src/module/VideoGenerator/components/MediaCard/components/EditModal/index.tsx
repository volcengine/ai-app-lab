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

import { useContext, useEffect, useRef, useState } from 'react';

import { Button, Input, Link, Modal, ModalProps, Select } from '@arco-design/web-react';
import { IconClose } from '@arco-design/web-react/icon';

import { IconRetry } from '@/images/iconBox';
import { ReactComponent as IconAiLine } from '@/images/icon_ai_line.svg';
import doubaoLogo from '@/images/assets/doubao_logo.png';
import { ChatWindowContext } from '@/components/ChatWindowV2/context';

import styles from './index.module.less';


interface EditModalProps extends ModalProps {
  media: React.ReactNode;
  onGenerate?: (prompt: string, tone?: string) => void;
  onPromptGenerate?: () => void;
  prompt?: React.ReactNode;
  tone?: string;
  modelInfo?: { displayName: string; modelName: string; modelVersion?: string; imgSrc: string };
  defaultPrompt?: string;
  promptLoading?: boolean;
  type?: 'video' | 'audio' | 'image';
}

interface Tone {
  DisplayName: string;
  Tone: string;
}

const EditModal = (props: EditModalProps) => {
  const {
    onGenerate,
    onCancel,
    onPromptGenerate,
    promptLoading,
    media,
    modelInfo,
    defaultPrompt,
    type,
    tone,
    ...otherProps
  } = props;
  const [prompts, setPrompts] = useState<string>();
  const { assistantInfo } = useContext(ChatWindowContext);
  const [tones, setTones] = useState<Tone[]>([]);
  const selectPopRef = useRef<HTMLDivElement>(null);
  const [toneSelect, setToneSelect] = useState<string>('');

  useEffect(() => {
    setTones((assistantInfo as any).Extra.Tones);
  }, [assistantInfo]);

  useEffect(() => {
    setPrompts(defaultPrompt || '');
    setToneSelect(tone || '');
  }, [defaultPrompt, tone]);

  return (
    <Modal
      {...otherProps}
      footer={null}
      onCancel={onCancel}
      modalRender={() => (
        <div className={styles.editModal} ref={selectPopRef}>
          <div className={styles.closeBtn}>
            <IconClose className={styles.close} onClick={onCancel} />
          </div>
          <div className={styles.mediaWrapper}>{media}</div>
          <div className={styles.mediaInfo}>
            <div className={styles.taskInfo}>
              <img src={modelInfo?.imgSrc || doubaoLogo} className={styles.img} />
              <div className={styles.infoText}>
                <div className={styles.modelName}>{modelInfo?.displayName || 'Doubao'}</div>
                {type === 'audio' ? (
                  <div className={styles.time}>
                    {'支持超自然、个性化的语音，'}
                    <Link
                      href="https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=ve-tts"
                      target="_blank"
                    >
                      {'更多信息'}
                    </Link>
                  </div>
                ) : (
                  <div className={styles.time}>
                    {'支持多种视觉风格，'}
                    <Link
                      href="https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-t2i-drawing"
                      target="_blank"
                    >
                      {'更多信息'}
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.argusContent}>
              <div className={styles.argusBlock}>
                <div className={styles.title}>{'创意描述'}</div>
                <Input.TextArea
                  className={styles.input}
                  value={prompts}
                  onChange={setPrompts.bind(null)}
                  showWordLimit={true}
                  maxLength={800}
                  autoSize={false}
                  disabled={promptLoading}
                />
                {onPromptGenerate ? (
                  <Button className={styles.regenerateButton} onClick={onPromptGenerate} disabled={promptLoading}>
                    <div>{'同步最新描述'} </div>
                    <IconRetry />
                  </Button>
                ) : null}
              </div>
              <div className={styles.argusBlock}>
                <div className={styles.title}>
                  {type === 'audio' ? '音色选择' : '参数'}
                </div>
                {type !== 'audio' && (
                  <div className={styles.argusTag}>
                    <div>
                      {type === 'image' ? '图片比例' : '视频比例'}
                    </div>
                    <div>1:1</div>
                  </div>
                )}
                {type === 'audio' && (
                  <Select
                    style={{ width: 310 }}
                    value={toneSelect}
                    onChange={setToneSelect}
                    getPopupContainer={() => selectPopRef.current || document.body}
                  >
                    {tones.map((item, index) => (
                      <Select.Option value={item.Tone} key={index}>
                        {item.DisplayName}
                      </Select.Option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
            <Button
              icon={<IconAiLine />}
              className={styles.submitBtn}
              type="primary"
              onClick={() => {
                if (!prompts || (type === 'audio' && !toneSelect)) {
                  onCancel?.();
                  return;
                }
                onGenerate?.(prompts, toneSelect);
                onCancel?.();
              }}
            >
              {'保存描述'}
            </Button>
          </div>
        </div>
      )}
    />
  );
};

export default EditModal;
