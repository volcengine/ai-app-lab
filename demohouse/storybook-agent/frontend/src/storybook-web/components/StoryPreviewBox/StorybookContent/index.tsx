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

import {
  useStoryBookAPI,
  useStoryBooksState,
  VsStoryBook,
} from "@/common/components/StoryBook";
import { forwardRef, useImperativeHandle } from "react";

export interface IStoryBookExposeAPI {
  goNextPage: () => void;
}

export const StorybookContent = forwardRef<
  IStoryBookExposeAPI,
  { isLoading: boolean; className?: string }
>(({ isLoading, className }, ref) => {
  const storybookAPI = useStoryBookAPI();
  const data = useStoryBooksState();

  useImperativeHandle(ref, () => ({
    goNextPage: () => {
      storybookAPI?.goNextPage?.();
    },
  }));
  return (
    <div className={className}>
      <div className="w-[600px] h-[400px] max-md:w-auto max-md:h-auto">
        <VsStoryBook
          onPageChange={(page) => {
            console.log(page, "page");
          }}
          showReadAgainButton={!isLoading}
          readAgainButtonText={"重新阅读"}
          formatPageNumber={(pageNum) => `第${pageNum}页`}
          formatPageTotal={(total) => `共${total}页`}
          slots={{
            cover({ data, comp: CoverComp }) {
              return (
                <CoverComp
                  {...data}
                  // slot={
                  //   <div className="-top-[2px] h-[40px] flex items-center justify-center bg-red-800">
                  //     自定义封面
                  //   </div>
                  // }
                />
              );
            },
            text({ data, comp: TextComp }) {
              return (
                <TextComp
                  {...data}
                  // text="自定义内容"
                  slot={
                    isLoading ? (
                      <div className="absolute bottom-0 left-0 right-0 text-center">
                        loading
                      </div>
                    ) : null
                  }
                />
              );
            },
          }}
        ></VsStoryBook>
      </div>
    </div>
  );
});
