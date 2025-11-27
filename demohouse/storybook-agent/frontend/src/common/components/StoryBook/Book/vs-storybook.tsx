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

import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  ReactNode,
  useMemo,
  useEffect,
  isValidElement,
  cloneElement,
  ReactElement,
  FC,
} from "react";
import { VsPage } from "./vs-page";
import "./index.scss";
import {
  VsStoryBookLeftPageThickness,
  VsStoryBookRightPageThickness,
} from "../PageThickness";
import cx from "classnames";
import { motion } from "framer-motion";
import {
  currentPageToPageNumberAdaptor,
  IDataCoverItem,
  IDataPageImageItem,
  IDataPageTextItem,
  indexToPageAdaptor,
  useStoryBookAPI,
  useStoryBooksState,
} from "..";
import { VsStoryBookPage } from "./page";
import { useIsMobile } from "../hooks/useMobile";
import { VsStoryBookMobile } from "../MobileBook";
import { IStoryBookMobileBookProps } from "../MobileBook/types";
import { IVsStoryBookConfigContext, VSStoryBookConfigContext } from "./const";
import {
  type VsStoryBookPageCover,
  type VsStoryBookPageImage,
  type VsStoryBookPageText,
} from "./page";

export interface IVsStorybookProps {
  children?: ReactNode;
  /* 页面是否由外部控制 */
  currentPage?: number;
  onClickNext?: (page: number) => void;
  onClickPrev?: (page: number) => void;
  onPageChange?: (page: number) => void;
  onClickReadAgain?: () => void;
  /**
   * 重新阅读按钮文案（接国际化时要配置）
   * */
  readAgainButtonText?: string;
  showPagination?: boolean;
  /**
   * 自定义插槽
   * FYI: 目前仅支持PC端组件
   * */
  slots?: IVsStorybookSlots;
  /**
   * 是否展示重新阅读按钮
   * */
  showReadAgainButton?: boolean;
  /**
   * 是否禁用掉点击进行翻页
   * */
  disableClickPage?: boolean;
}

export interface IVsStorybookSlots {
  cover?: FC<{
    data: IDataCoverItem;
    comp: typeof VsStoryBookPageCover;
  }>;
  image?: FC<{
    data: IDataPageImageItem;
    comp: typeof VsStoryBookPageImage;
  }>;
  text?: FC<{
    data: IDataPageTextItem;
    comp: typeof VsStoryBookPageText;
  }>;
}

export interface IVsStorybookExposeApi {
  goPage: (pageNumber: number) => void;
  goNextPage: () => void;
  goPrevPage: () => void;
  goFirstPage: () => void;
  goLastPage: () => void;
}

export const VsStoryBookPC = forwardRef<
  IVsStorybookExposeApi,
  IVsStorybookProps
>(
  (
    {
      children = [],
      onClickNext,
      onClickPrev,
      currentPage: controlledPage,
      onPageChange,
      onClickReadAgain,
      readAgainButtonText,
      showPagination = true,
      showReadAgainButton = true,
      disableClickPage,
      slots,
    },
    ref
  ) => {
    const contextState = useStoryBooksState();
    const { list = [] } = contextState ?? {};
    const arrayChildren = React.Children.toArray(children);
    const pages = arrayChildren?.length
      ? arrayChildren
      : list.map((item) => (
          <VsStoryBookPage
            {...item}
            id={item.key}
            key={item.key}
            readAgainButtonText={readAgainButtonText}
          />
        ));
    const totalPages = pages.length;
    const [currentPage, setCurrentPage] = useState(1);
    const {
      usedByContext,
      goPage: contextGoPage,
      goNextPage: contextGoNextPage,
      goFirstPage: contextGoFirstPage,
      goPrevPage: contextGoPrevPage,
    } = useContextPage(setCurrentPage);
    const { usedByControlled } = useControlledPage(
      controlledPage,
      setCurrentPage
    );
    const configContext = useMemo<IVsStoryBookConfigContext>(
      () => ({
        showPagination,
        slots,
        showReadAgainButton,
        disableClickPage,
      }),
      [showPagination, slots, showReadAgainButton, disableClickPage]
    );

    const _onClickPrev = (pageNum: number) => {
      if (usedByContext) {
        contextGoPrevPage?.();
      }
      onClickPrev?.(indexToPageAdaptor(pageNum));
    };

    const _onClickNext = (pageNum: number) => {
      if (usedByContext) {
        contextGoNextPage?.();
      }
      onClickNext?.(indexToPageAdaptor(pageNum));
    };

    const _onClickReadAgain = () => {
      if (usedByContext) {
        contextGoFirstPage?.();
      }
      onClickReadAgain?.();
    };

    /** 是否受控 */
    const isControlled = usedByContext;

    const goPage = (page: number) => {
      if (page === currentPage) {
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
      if (usedByContext) {
        const index = currentPageToPageNumberAdaptor(target);
        contextGoPage?.(index);
      } else if (usedByControlled) {
        onClickReadAgain?.();
      } else {
        setCurrentPage(target);
      }
    };

    // 当 pageNumber 变化时，调用 onPageChange 回调
    useEffect(() => {
      // 确保 onPageChange 是一个函数
      const pageNumber = currentPageToPageNumberAdaptor(currentPage);
      onPageChange?.(pageNumber);
    }, [currentPage]);

    const exposeApi: IVsStorybookExposeApi = {
      goPage: (pageNumber) => {
        goPage(pageNumber);
      },
      goNextPage: () => {
        goPage(currentPage + 2);
      },
      goPrevPage: () => {
        goPage(currentPage - 2);
      },
      goFirstPage: () => {
        goPage(1);
      },
      goLastPage: () => {
        goPage(pages.length);
      },
    };

    useImperativeHandle(ref, () => exposeApi);

    const handleChangePage = (pageNumber: number) => {
      if (pageNumber % 2 !== 0) {
        if (pageNumber + 1 <= totalPages) {
          setCurrentPage(pageNumber + 2);
        }
      } else {
        if (pageNumber - 1 >= 1) {
          setCurrentPage(pageNumber - 1);
        }
      }
    };

    // 动态判断是否应用位移类名
    const isCover = currentPage === 1;
    const bookClasses = `vs-storybook ${
      isCover ? "vs-storybook--has-cover" : ""
    }`;
    const showLeftThickness = useMemo(
      () => pages.length >= 2 && currentPage > 3,
      [currentPage, pages]
    );
    const showRightThickness = useMemo(
      () => pages.length >= 2 && currentPage <= pages.length - 2,
      [currentPage, pages]
    );

    return (
      <VSStoryBookConfigContext.Provider value={configContext}>
        <div className={bookClasses}>
          <div className="vs-storybook__pages">
            {showLeftThickness ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="h-full origin-left w-1/2"
              >
                <VsStoryBookLeftPageThickness />
              </motion.div>
            ) : null}
            {showRightThickness ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="h-full origin-left w-1/2"
              >
                <VsStoryBookRightPageThickness />
              </motion.div>
            ) : null}
            {pages.map((page, index) => {
              const pageNum = index + 1;
              const isRight = pageNum % 2 !== 0;
              const isFlipped = (isRight ? pageNum : pageNum - 1) < currentPage;
              const zIndex = isRight ? totalPages + 1 - index : undefined;
              const firstPageActive = 1 === pageNum && currentPage === pageNum;
              const isActive = !firstPageActive && currentPage === pageNum;
              const isLastPage = pageNum === totalPages;
              const isActiveLeft = !isRight && pageNum + 1 === currentPage;
              const isUnderneath =
                pageNum - 2 === currentPage || pageNum + 3 === currentPage; // 前一页的左侧和盖住的下一页
              /* 不展示 hover bar的条件： 不是第一页最后一页和第二页 */
              const showHoverBar =
                !isLastPage && !firstPageActive && pageNum !== 2;

              const clazz = cx(
                `${
                  firstPageActive ? "vs-storybook__page--first-page-active" : ""
                }`,
                isActive && isRight && "vs-storybook__page-active--right",
                isActiveLeft && "vs-storybook__page-active--left",
                isLastPage && "vs-storybook__page--last-page-active",
                isUnderneath && "vs-storybook__page--underneath"
              );

              return (
                <VsPage
                  key={pageNum}
                  pageNum={pageNum}
                  isRight={isRight}
                  showHoverBar={showHoverBar}
                  isFlipped={isFlipped}
                  onFlip={(_, pageNumber) => {
                    if (disableClickPage) {
                      return;
                    }

                    if (!isControlled) {
                      handleChangePage(pageNumber);
                    }
                    if (isRight) {
                      _onClickNext?.(pageNum);
                    } else {
                      _onClickPrev?.(pageNum);
                    }
                  }}
                  style={{ zIndex }}
                  className={clazz}
                >
                  {isValidElement(page)
                    ? cloneElement<IVsStorybookProps>(page as ReactElement, {
                        onClickReadAgain() {
                          _onClickReadAgain?.();
                        },
                      })
                    : page}
                </VsPage>
              );
            })}
          </div>
        </div>
      </VSStoryBookConfigContext.Provider>
    );
  }
);

/**
 * 故事书组件， 封面为第一页
 * */
export const VsStoryBook = forwardRef<
  IVsStorybookExposeApi,
  IVsStorybookProps & IStoryBookMobileBookProps
>((props, ref) => {
  const isMobile = false; // useIsMobile();
  const contextState = useStoryBooksState();
  const { sourceList = [] } = contextState ?? {};
  // const _onClickReadAgain = () => {
  //   // 否则由接入方去处理
  //   if (isMobile) {
  //     props.onClickReadAgain?.();
  //   }
  // };
  return isMobile ? (
    <VsStoryBookMobile {...props} list={sourceList} />
  ) : (
    <VsStoryBookPC {...props} ref={ref} />
  );
});

/**
 * @deprecated will be deprecated in the future
 * */
export const VsStorybook = VsStoryBook;

/*
 * controlled page hooks
 * */
function useControlledPage(
  controlledPage: number | undefined,
  setCurrentPage: (page: number) => void
) {
  const usedByControlled = typeof controlledPage !== "undefined";

  useEffect(() => {
    if (usedByControlled) {
      setCurrentPage(controlledPage);
    }
  }, [usedByControlled, controlledPage]);

  return {
    usedByControlled,
  };
}

/*
 * context page hooks
 * */
function useContextPage(setCurrentPage: (page: number) => void) {
  const contextState = useStoryBooksState();
  const contextApi = useStoryBookAPI();
  const { currentPage: contextPageState } = contextState ?? {};
  const usedByContext = typeof contextPageState !== "undefined";
  const { goPage, goNextPage, goPrevPage, goFirstPage } = contextApi ?? {};

  useEffect(() => {
    if (usedByContext && typeof contextPageState !== "undefined") {
      setCurrentPage(contextPageState);
    }
  }, [usedByContext, contextPageState]);

  return {
    usedByContext,
    goPage,
    goNextPage,
    goPrevPage,
    goFirstPage,
  };
}
