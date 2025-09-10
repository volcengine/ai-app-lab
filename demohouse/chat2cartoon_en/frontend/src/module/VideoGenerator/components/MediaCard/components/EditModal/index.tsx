import { useContext, useEffect, useRef, useState } from 'react';

import { Button, Input, Link, Modal, ModalProps, Select } from '@arco-design/web-react';
// import { IconClose, IconRetry } from '@arco-design/iconbox-react-ve-o-design';

import { ReactComponent as IconAiLine } from '@/images/icon_ai_line.svg';
import doubaoLogo from '@/images/assets/doubao_logo.png';
import { ChatWindowContext } from '@/components/ChatWindowV2/context';

import styles from './index.module.less';
import { IconClose, IconRetry } from '@/images/iconBox';

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
                    {'Supports supernatural, personalized speech.'}
                  </div>
                ) : (
                  <div className={styles.time}>
                    {'Supports a variety of visual styles.'}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.argusContent}>
              <div className={styles.argusBlock}>
                <div className={styles.title}>{'Prompt'}</div>
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
                    <div>{'Sync'} </div>
                    <IconRetry />
                  </Button>
                ) : null}
              </div>
              <div className={styles.argusBlock}>
                <div className={styles.title}>
                  {type === 'audio' ? 'Voice type' : 'Setting'}
                </div>
                {type !== 'audio' && (
                  <div className={styles.argusTag}>
                    <div>
                      {type === 'image' ? 'Ratio' : 'Ratio'}
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
              {'Save'}
            </Button>
          </div>
        </div>
      )}
    />
  );
};

export default EditModal;
