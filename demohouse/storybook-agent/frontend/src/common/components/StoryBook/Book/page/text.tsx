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

import { IDataPageTextItem } from "../types";
import "./text.scss";
import { ReactComponent as IconReadAgain } from "./imgs/read-again-icon.svg";
import { useStoryBookConfig, useStoryBooksState } from "..";
import { useMemo } from "react";

/**
 * 右侧文本组件
 * */
export const VsStoryBookPageText = (data: IDataPageTextItem) => {
  const {
    isLastPage,
    text,
    onClickReadAgain,
    readAgainButtonText,
    pageNumber,
    slot,
  } = data ?? {};
  const { showPagination, showReadAgainButton } = useStoryBookConfig();
  const _showReadAgainButton = useMemo(
    () => showReadAgainButton && !!isLastPage,
    [showReadAgainButton, isLastPage]
  );
  return (
    <div className="vs-storybook__page-text w-full h-full py-[32px] flex flex-col justify-center items-center mix-blend-multiply md:text-[19px] max-md:text-xs leading-[30px] tracking-[0.94px] text-[var(--color-text-2,#3f3f51)] vs-storybook__page-text px-[15%] gap-[30px]">
      <span className="vs-storybook__page-text__content w-full overflow-y-auto word leading-[1.4]">
        {text ?? ""}
      </span>
      {/* 按钮 */}
      {_showReadAgainButton && (
        <VsStoryBookReadAgain
          text={readAgainButtonText}
          onClick={() => {
            onClickReadAgain?.();
          }}
        />
      )}
      {slot ? slot : null}
      {showPagination && (
        <div className="vs-storybook__page-text__pagination absolute bottom-[1rem] right-[1rem] md:text-[16px] max-md:text-[10px] leading-none tracking-[0.05px] text-[#575b5f] text-right">
          {pageNumber}
        </div>
      )}
    </div>
  );
};

/*
 * 重新阅读
 * */
export const VsStoryBookReadAgain = (props: {
  onClick: () => void;
  text?: string;
}) => {
  const { onClick, text = "重新阅读" } = props;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="vs-storybook__page-text__read-again flex justify-center shrink-0 items-center cursor-pointer gap-x-[7px] px-[15px] py-[7px] border-[1px] border-[#aeafc2] rounded-[6px] overflow-hidden text-[#6e718c] text-[12px] leading-[21px] tracking-[0.04px]"
    >
      <IconReadAgain className="shrink-0 size-[11px]" />
      <div className="flex-1">{text}</div>
    </div>
  );
};
