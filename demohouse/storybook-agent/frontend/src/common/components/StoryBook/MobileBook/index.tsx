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

import { IStoryBookMobileBookProps } from "./types";
import { VsStoryBookMobilePageItem } from "./page-item";
import { useMemo, useRef } from "react";
export * from "./page/index";
export * from "./types";
export * from "./page-item";

/**
 * 适配移动端设备的故事书展示效果
 * */
export const VsStoryBookMobile = ({
  list = [],
  formatPageNumber,
  formatPageTotal,
  readAgainButtonText,
}: IStoryBookMobileBookProps) => {
  const len = list?.length ?? 0;
  const refList = useRef<(HTMLDivElement | null)[]>([]);
  const _onClickReadAgain = () => {
    refList.current[0]?.scrollIntoView?.({
      behavior: "smooth",
    });
  };
  return (
    <div className="vs-storybook-mobile w-full">
      {list.map((item, index) => (
        <VsStoryBookMobilePageItem
          ref={(ref) => {
            refList.current[index] = ref;
          }}
          key={item.id}
          {...item}
          pageNum={index}
          pageSize={len}
          formatPageNumber={formatPageNumber}
          formatPageTotal={formatPageTotal}
          readAgainButtonText={readAgainButtonText}
          onClickReadAgain={_onClickReadAgain}
        />
      ))}
    </div>
  );
};
