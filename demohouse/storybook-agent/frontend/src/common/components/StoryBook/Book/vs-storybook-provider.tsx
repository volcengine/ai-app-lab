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
  IVsStorybookAPIContext,
  IVsStorybookStateContext,
  VSStoryBookAPIContext,
  VSStoryBookStateContext,
} from "./const";
import { VSStoryBookProviderProps } from "./types";
import { FC, useMemo, useState } from "react";
import {
  dataAdaptor,
  currentPageToPageNumberAdaptor,
  totalPageAdaptor,
  indexToPageAdaptor,
} from "./adaptors";

export const VSStoryBookProvider: FC<VSStoryBookProviderProps> = ({
  list,
  children,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pages = useMemo(() => dataAdaptor(list), [list]);
  const totalPage = useMemo(() => totalPageAdaptor(pages.length), [pages]);
  const isLastPage = useMemo(
    () => currentPage === pages.length,
    [currentPage, pages]
  );
  const isFirstPage = useMemo(() => currentPage === 1, [currentPage]);

  const stateValue = useMemo<IVsStorybookStateContext>(
    () => ({
      sourceList: list,
      list: pages,
      pageNum: currentPageToPageNumberAdaptor(currentPage),
      currentPage,
      totalPage,
      isFirstPage,
      isLastPage,
    }),
    [pages, currentPage, totalPage, isFirstPage, isLastPage]
  );

  const goPage = (page: number) => {
    if (currentPage === page) {
      return;
    }
    // 修正为
    const len = pages.length;
    let target = page;
    if (page <= 0) {
      target = 1;
    } else if (page > len) {
      target = len;
    } else if (page % 2 === 0) {
      target = page + 1;
    }
    setCurrentPage(target);
  };

  const apiValue = useMemo<IVsStorybookAPIContext>(() => {
    return {
      goFirstPage: () => {
        goPage(1);
      },
      goLastPage: () => {
        goPage(pages.length);
      },
      goPage: (index: number) => {
        const pageNumber = indexToPageAdaptor(index);
        goPage(pageNumber);
      },
      goPrevPage: () => {
        goPage(currentPage - 2);
      },
      goNextPage: () => {
        goPage(currentPage + 2);
      },
    };
  }, [totalPage, currentPage]);

  return (
    <VSStoryBookStateContext.Provider value={stateValue}>
      <VSStoryBookAPIContext.Provider value={apiValue}>
        {children}
      </VSStoryBookAPIContext.Provider>
    </VSStoryBookStateContext.Provider>
  );
};
