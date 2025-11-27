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

import React, { useEffect, useRef, useState } from "react";
import cx from "classnames";
import { ReactComponent as ArrowIcon } from "../assets/arrow.svg";

export const ArrowButton = ({
  direction = "left",
  onClick,
  className,
  isDisable = false,
  style,
}: {
  direction?: "left" | "right" | "top" | "bottom";
  onClick?: (e: any) => void;
  className?: string;
  isDisable?: boolean;
  style?: React.CSSProperties;
}) => (
  <div
    style={style}
    className={cx(
      "h-[40px] w-[40px] rounded-[20px] bg-[rgba(0,0,0,0.3)]  flex items-center justify-center",
      {
        ["rotate-180"]: direction === "right",
        ["rotate-90"]: direction === "bottom",
        ["-rotate-90"]: direction === "top",
      },
      { ["cursor-pointer"]: !isDisable, ["cursor-not-allowed"]: isDisable },
      className
    )}
    onClick={(e) => {
      if (isDisable) {
        return;
      }
      onClick?.(e);
    }}
  >
    <ArrowIcon
      className={cx("h-[31px] w-[31px]", { ["opacity-30"]: isDisable })}
    />
  </div>
);

interface IImageGalleryProps {
  imageList: string[];
  selectedIndex?: number;
  onSelect: (index: number) => void;
}

const ImageGallery: React.FC<IImageGalleryProps> = ({
  imageList,
  selectedIndex,
  onSelect,
}) => {
  const [leftButtonAvailable, setLeftButtonAvailable] =
    useState<boolean>(false); // 左按钮是否可用
  const [rightButtonAvailable, setRightButtonAvailable] =
    useState<boolean>(false); // 右按钮是否可用

  const imgRefs = useRef<Record<string, HTMLImageElement | null>>({});

  useEffect(() => {
    // 管理imgRef，删除无效引用
    Object.keys(imgRefs.current).forEach((key) => {
      if (!imageList.includes(key)) {
        delete imgRefs.current[key];
      }
    });
  }, [imageList]);

  useEffect(() => {
    // 设置两边按钮可用性
    if (!imageList?.length) {
      setLeftButtonAvailable(false);
      setRightButtonAvailable(false);
      return;
    }
    setLeftButtonAvailable(selectedIndex !== 0);
    setRightButtonAvailable(selectedIndex !== imageList.length - 1);

    // 滚动到当前图片
    const selectedImg = imgRefs.current[imageList[selectedIndex!]];
    if (selectedImg) {
      selectedImg.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [imageList, selectedIndex]);

  const selectByOffset = (offset: number) => {
    let targetIndex = selectedIndex || 0;
    targetIndex = Math.min(
      imageList.length - 1,
      Math.max(0, targetIndex + offset)
    );
    onSelect(targetIndex || 0);
  };

  const handleImgClick = (index: number) => {
    onSelect(index);
  };

  return (
    <div className={"w-full h-full flex items-center justify-between"}>
      <ArrowButton
        className={"mr-[12px] ml-[56px] shrink-0"}
        isDisable={!leftButtonAvailable}
        onClick={() => {
          selectByOffset(-1);
        }}
      />
      <div className={cx("overflow-x-scroll  w-fit")}>
        <div className={"h-[56px] flex flex-row gap-[8px] items-stretch"}>
          {imageList.map((imageUrl, index) => (
            <img
              key={imageUrl}
              src={imageUrl}
              ref={(el) => {
                imgRefs.current[imageUrl] = el; // 动态添加每个元素的 ref
              }}
              className={cx(
                "border-solid border-[3px] rounded-[2px] h-[56px] object-cover max-w-none cursor-pointer",
                {
                  ["border-[#fff]"]: selectedIndex === index,
                  ["border-[#fff0]"]: selectedIndex !== index,
                }
              )}
              onClick={() => {
                handleImgClick(index);
              }}
            ></img>
          ))}
        </div>
      </div>

      <ArrowButton
        direction="right"
        className={"mr-[56px] ml-[12px] shrink-0"}
        isDisable={!rightButtonAvailable}
        onClick={() => {
          selectByOffset(1);
        }}
      />
    </div>
  );
};

export default ImageGallery;
