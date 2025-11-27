/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useEffect, useState } from "react";

import { Modal } from "@arco-design/web-react";
import { ReactComponent as CloseIcon } from "./assets/close.svg";
import ImageGallery from "./ImageGallery";

interface IImageViewModalProps {
  visible?: boolean;
  imageList: string[];
  initialIndex?: number;
  onClose?: () => void;
}

export const ImageViewModal: React.FC<IImageViewModalProps> = ({
  visible,
  imageList,
  initialIndex,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(
    initialIndex
  );
  console.log("--selectedIndex--", selectedIndex);

  useEffect(() => {
    setSelectedIndex(initialIndex);
  }, [visible, initialIndex]); // 这里不检查currentSid的变化

  const handleClose = () => {
    onClose?.();
  };

  if (!imageList?.length) {
    return null;
  }
  return (
    <>
      <Modal
        visible={visible}
        mask={true}
        modalRender={() => (
          <div
            className={"absolute top-0 left-0 bottom-0 right-0"}
            onClick={handleClose}
          >
            <div className={"absolute top-0 left-0 bottom-0 right-0"}></div>
            <CloseIcon
              className={"absolute right-[32px] top-[32px] cursor-pointer"}
            />
            <div
              className={
                "absolute top-[92px] bottom-[140px] left-[15px] right-[15px] flex items-center justify-center"
              }
              onClick={handleClose}
            >
              {imageList[selectedIndex!] && (
                <img
                  className={"max-h-full max-w-full object-contain"}
                  src={imageList[selectedIndex!]}
                  onClick={(event) => {
                    event.stopPropagation(); // 阻止事件冒泡
                  }}
                ></img>
              )}
            </div>
            <div
              className={
                "absolute bottom-[0px] left-[0px] right-[0px] h-[98px]"
              }
              onClick={(event) => {
                event.stopPropagation(); // 阻止事件冒泡
              }}
            >
              <ImageGallery
                imageList={imageList || []}
                selectedIndex={selectedIndex}
                onSelect={(index: number) => setSelectedIndex(index)}
              />
            </div>
          </div>
        )}
      />
    </>
  );
};
