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

import { IStoryBookMobilePageContent } from "../types";
import { VsStoryBookMobilePageContentCover } from "./cover";
import { VsStoryBookReadAgain } from "../..";

const defaultFormatPageNumber = (pageNumber: number) => `第 ${pageNumber} 页`;
const defaultFormatTotalPageNumber = (total: number) => `共 ${total} 页`;

export const VsStoryBookMobilePageContentBase = ({
  pageNum,
  pageSize,
  formatPageNumber = defaultFormatPageNumber,
  formatTotalPageNumber = defaultFormatTotalPageNumber,
  url,
  text,
  readAgainButtonText,
  onClickReadAgain,
}: IStoryBookMobilePageContent) => {
  const isLastPage = pageNum === pageSize - 1;
  return (
    <div className="flex flex-col items-start gap-y-[16px] text-[#3f3f51] overflow-hidden w-full">
      <div className="shrink-0 inline-flex items-center gap-x-[4px] text-[12px] leading-[22px] tracking-[0.04px] font-[500]">
        <div className="text-[#6e718c] shrink-0">
          {formatPageNumber(pageNum)}
        </div>
        <div className="shrink-0 relative w-[2px] h-[12px]">
          <div className="rotate-[7deg] absolute left-[1px] top-[1px] w-[1px] h-[12px] bg-[#d9d9d9]" />
        </div>
        <div className="text-[#aeafc2] shrink-0 min-w-[40px]">
          {formatTotalPageNumber(pageSize - 1)}
        </div>
      </div>
      <div className="text-[22px] leading-[32px] tracking-[1.1px] self-stretch shrink-0">
        {text}
      </div>
      <img src={url} className="self-stretch shrink-0 w-full rounded-[16px]" />
      {isLastPage && (
        <div className="flex w-full justify-center mt-[16px]">
          <VsStoryBookReadAgain
            text={readAgainButtonText}
            onClick={onClickReadAgain}
          />
        </div>
      )}
    </div>
  );
};

export const VsStoryBookMobilePageContent = (
  props: IStoryBookMobilePageContent
) => {
  const { isCover } = props;
  return isCover ? (
    <VsStoryBookMobilePageContentCover {...props} />
  ) : (
    <VsStoryBookMobilePageContentBase {...props} />
  );
};
