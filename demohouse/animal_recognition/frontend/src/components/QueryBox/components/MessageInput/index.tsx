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

/* eslint-disable react/destructuring-assignment */
/* eslint-disable max-lines-per-function */
import { FC, useCallback, useMemo, useRef, useState, useEffect, useContext } from 'react';

import clsx from 'classnames';
import { Divider, Message, Upload } from '@arco-design/web-react';
import { ImageType, QueryParamsType } from '@/store/Query/context';
import { UploadTosContext } from '@/store/UploadTos/context';
import { useCompositionStatus } from '@/hooks/useCompositionStatus';
import { IconLoading, IconSend, IconUploadDelete, IconUploadImage } from '@/images';
import { useClickOutside } from '@/hooks/useClickOutside';

interface Props {
  /**
   * 检索参数
   */
  value: QueryParamsType;

  /**
   * 检索参数发生变化
   * @param value 检索参数
   * @returns void
   *
   */
  onChange: (value: QueryParamsType | ((query: QueryParamsType) => QueryParamsType)) => void;

  /**
   * 是否自动聚焦在输入框
   * @default true
   * @optional
   */
  autoFocus: boolean;

  /**
   * 处理发送事件
   * @required
   */
  handleSend: () => void;

  /**
   * 禁用展开和输入
   *
   */

  expandDisabled?: boolean;
}
/**
 * 发送按钮
 * @param props
 * @returns
 */
const SendButton: FC<{ active: boolean; onClick: () => void }> = ({ active, onClick }) => (
  <div
    className={`w-11 h-7 rounded-[14px] flex items-center justify-center transition-[background] duration-300 ${
      active ? ' cursor-pointer' : ' cursor-not-allowed'
    }`}
    onClick={onClick}
    style={{
      background: active
        ? 'linear-gradient(149deg, #7E83FF 13.01%, #735CFF 46.75%, #3671FF 85.57%)'
        : 'linear-gradient(0deg, rgba(255, 255, 255, 0.50) 0%, rgba(255, 255, 255, 0.50) 100%), linear-gradient(149deg, #7E83FF 13.01%, #735CFF 46.75%, #3671FF 85.57%)',
    }}
  >
    <IconSend />
  </div>
);

/**
 * 消息输入框
 * @param props
 * @constructor
 */
export const MessageInput = (props: Props) => {
  const { text, image } = props.value;
  const onChangeText = (text: string) => {
    props.onChange(query => ({ text, image: query.image }));
  };
  const onChangeImage = (image: ImageType | null) => {
    props.onChange(query => ({ text: query.text, image }));
  };
  const { isComposing, handleCompositionStart, handleCompositionEnd } = useCompositionStatus();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const { uploadTos,getPreSignedUrl } = useContext(UploadTosContext);
  const [triggerCanNotSendMessage, setTriggerCanNotSendMessage] = useState(false);

  const attachmentHeight = useMemo(() => {
    if (!image) {
      return 0;
    }
    return 104;
  }, [image]);

  useEffect(() => {
    const container = containerRef.current;
    const textarea = textareaRef.current;

    if (container && textarea) {
      // 容器上下边距
      const padding =
        Number(getComputedStyle(container).paddingTop.replace('px', '')) +
        Number(getComputedStyle(container).paddingBottom.replace('px', ''));

      // 按钮大小
      const buttonHeight = expanded ? 42 : 6;

      // 外部容器的最新高度，实际和原本高度一样，但是这样可以触发动画过渡
      const newHeight = textarea.scrollHeight + padding + buttonHeight + attachmentHeight;
      container.style.height = `${newHeight}px`;
    }
  }, [image, attachmentHeight, expanded]);

  /**
   * 折叠整体输入框
   * 注意只能输入框没有内容时调用，否则会导致内容展示不全
   * 此函数专注于样式处理
   */
  const toFold = useCallback(() => {
    setExpanded(false);
    // 恢复文本输入框高度
    if (textareaRef.current) {
      textareaRef.current.style.height = '22px';
    }

    if (containerRef.current) {
      containerRef.current.style.height = '';
    }
  }, []);

  /**
   * 是否可以发送消息，需要满足其中一个条件：
   * 1. 文本有内容
   * 2. 图片上传完成
   */
  const activeSendButton = useMemo(
    () => !uploadLoading && (Boolean(image) || text.length > 0),
    [uploadLoading, text, image],
  );

  /**
   * 处理发送消息逻辑
   */
  const handleSendMessage = useCallback(() => {
    if (!activeSendButton) {
      return;
    }
    props.handleSend();
    if (text || image) {
      return;
    }
    toFold();
  }, [activeSendButton, props.handleSend, toFold, text, image]);

  /**
   * 处理输入框内容变化
   * 当内容开始输入时，需要处理 UI 变化：
   * 1. 输入框需要跟随内容变高
   * 2. 整体对话框高度需要进行实时计算，虽然计算结果和真实高度其实是一样的，但是，如果不进行计算，就无法得到实际高度
   * 缺少实际高度，就无法进行动画过渡
   * @param e
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;

    // if (newMessage.length > props?.maxTokens) {
    //   setTriggerMaxTokens(true);
    //   newMessage = newMessage.slice(0, props?.maxTokens);
    // }

    onChangeText(newMessage);
  };

  /**
   * 处理文件上传
   */

  const handleUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      Message.error('图片大小不能超过10M');
      return;
    }
    setUploadLoading(true);
    try {
      const objectKey=`temp/${file.name}`
      // 预展示
      onChangeImage({
        disPlayUrl: URL.createObjectURL(file),
        objectKey
      });

      await uploadTos(file,objectKey,true)
      
      // 上传成功
      onChangeImage({
        disPlayUrl:await getPreSignedUrl(objectKey),
        objectKey
      });
    } catch {
      // 上传失败
      onChangeImage(null);
      Message.error('上传失败');
    } finally {
      setUploadLoading(false);
    }
  };

  /**
   * 最终判断是否发送消息的逻辑
   * 通过区分是否正在输入中，避免拼写输入时的 Enter 触发发送消息
   * @param e
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposing) {
        return;
      }

      // 必须是只按下 Enter 才会发送，按住 any + enter / cmd + enter 等等其他无需处理
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        handleSendMessage();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [isComposing, handleSendMessage],
  );

  /**
   * 处理输入框聚焦
   * @param _
   */
  const handleFocus = useCallback(() => {
    if (props?.expandDisabled) {
      return;
    }
    setExpanded(true);
  }, []);

  /**
   * 处理输入框失焦，只有在没有文本时，才会折叠
   * @param _
   */
  const handleBlur = useCallback(() => {
    if (text.length === 0 && !image) {
      toFold();
    }
  }, [text, image]);

  useEffect(() => {
    if (props?.expandDisabled) {
      return;
    }
    if (props?.autoFocus) {
      textareaRef.current?.focus();
      setExpanded(true);
    }
  }, [props.autoFocus, props?.expandDisabled]);

  useEffect(() => {
    if (text) {
      handleFocus();
    }
    if (!textareaRef.current) {
      return;
    }
    const textarea = textareaRef.current;
    // 浏览器为了减少重绘，默认情况不会更新 scrollHeight，这导致内容缩减也无法减少 scrollHeight
    // 会将高度设置为 auto，然后再设置为真实高度，就能得到真实高度
    textarea.style.height = 'auto';
    const textareaHeight = textarea.scrollHeight;
    const realTextAreaHeight = textareaHeight > 88 ? 88 : textareaHeight;
    textarea.style.height = `${realTextAreaHeight}px`;
    // 只有在大于 88 px 的时候，再出现滚动条
    if (realTextAreaHeight >= 88) {
      textarea.style.overflowY = 'scroll';
    } else {
      textarea.style.overflowY = 'hidden';
    }

    const container = containerRef.current;

    if (container) {
      // 按钮大小
      const buttonHeight = expanded ? 42 : 6;
      // 容器上下边距
      const padding =
        Number(getComputedStyle(container).paddingTop.replace('px', '')) +
        Number(getComputedStyle(container).paddingBottom.replace('px', ''));

      // 外部容器的最新高度，实际和原本高度一样，但是这样可以触发动画过渡
      const newHeight = realTextAreaHeight + padding + buttonHeight + attachmentHeight;
      container.style.height = `${newHeight}px`;
    }
  }, [text]);
  useClickOutside(containerRef.current, handleBlur);

  return (
    <div
      onClick={() => handleFocus()}
      id="message-input"
      className={clsx(
        `w-full  relative self-stretch box-border px-4 pt-[10px] pb-[10px] bg-white rounded-lg border  flex-col justify-start items-start gap-2 flex transition-all duration-300 overflow-y-hidden`,
        expanded ? ' border-[#6C54FF]' : ' border-[#BDB8E5]',
        props?.expandDisabled && 'bg-[#FCFDFE]',
        expanded ? (image ? 'h-[178px]' : 'h-[110px]') : image ? 'h-[134px]' : 'h-[48px] ',
      )}
      ref={containerRef}
    >
      {image && (
        <div className="relative h-[68px] w-[68px] rounded-[10px] overflow-hidden cursor-pointer group">
          <img className={`w-full h-full object-cover aspect-square`} src={image.disPlayUrl} />
          <IconUploadDelete
            className="absolute right-[3px] bottom-[3px] hidden group-hover:block"
            onClick={async e => {
              e.stopPropagation();
              onChangeImage(null);
            }}
          />
          {uploadLoading && (
            <div className={'absolute top-0 left-0 bottom-0 right-0 bg-black/40 flex items-center justify-center'}>
              <IconLoading />
            </div>
          )}
        </div>
      )}
      {Boolean(image) && (
        <div className={'w-full'}>
          <Divider className={'w-full mt-[14px] mb-[1px]'} />
        </div>
      )}
      <div className=" self-stretch justify-start items-center gap-0.5 inline-flex">
        <textarea
          style={{
            scrollbarWidth: 'none',
          }}
          rows={1}
          className={clsx(
            'focus:ring-0 focus-visible:ring-0 w-full text-[#0C0D0E] leading-[22px] p-0 border-0 text-[13px] overflow-hidden tracking-tight focus:outline-none resize-none max-h-[88px] mt-[3px] mb-[3px]',
            props?.expandDisabled && 'bg-[#FCFDFE]',
          )}
          placeholder="上传图片/输入文字"
          value={text}
          disabled={props?.expandDisabled}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          ref={textareaRef}
          maxLength={100}
        />
      </div>
      <div className={'absolute bottom-[10px] right-[60px] flex items-center '}>
        <Upload
          multiple={false}
          beforeUpload={file => {
            handleUpload(file);
            return false;
          }}
          accept="image/png,image/jpg,image/jpeg"
        >
          <IconUploadImage className="block" />
        </Upload>
        <Divider type="vertical" />
      </div>
      <div
        className={`w-11 h-7 bottom-[10px] right-[16px] absolute rounded-[14px] transition-all duration-300${
          triggerCanNotSendMessage ? ' animate-shake' : ''
        }`}
        onAnimationEnd={() => setTriggerCanNotSendMessage(false)}
      >
        <SendButton active={activeSendButton} onClick={handleSendMessage} />
      </div>
    </div>
  );
};
