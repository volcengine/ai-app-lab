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
  ReactNode,
  RefObject,
  ReactElement,
  isValidElement,
  cloneElement,
  forwardRef,
  useImperativeHandle,
} from "react";

import {
  IDataItem,
  IVsStorybookPage,
  VsStoryBookPage,
  IVsStorybookProps,
  dataAdaptor,
} from "@/common/components/StoryBook";
import { usePrint } from "../StoryBookPrint/usePrint";

import "./index.scss";
export const VsStoryBookPrint = ({
  children = [],
  list = [],
  containerRef,
}: {
  children?: ReactNode;
  list: IVsStorybookPage[];
  containerRef?: RefObject<HTMLDivElement>;
}) => {
  const arrayChildren = React.Children.toArray(children);
  const originalPages = arrayChildren?.length
    ? arrayChildren
    : list.map((item: any) => (
        <VsStoryBookPage {...item} id={item.key} key={item.key} />
      ));

  // 在开头添加一个空白页，让封面和空白页在同一屏幕
  const blankPage = (
    <div className="vs-storybook__blank-page" key="blank-page"></div>
  );
  const pages = [blankPage, ...originalPages];

  // 将页面按屏幕分组，每屏显示相邻的两页（类似真实书本的左右页面）
  const screens = [];
  for (let i = 0; i < pages.length; i += 2) {
    const leftPage = pages[i];
    const rightPage = pages[i + 1];
    screens.push({ leftPage, rightPage, screenIndex: i / 2 });
  }

  return (
    <div ref={containerRef} className="vs-storybook-print">
      {screens.map(({ leftPage, rightPage, screenIndex }) => (
        <div key={screenIndex} className="vs-storybook-print__screen">
          <div className="vs-storybook-print__book">
            <div className="vs-storybook-print__pages">
              {/* 左页 */}
              {leftPage && (
                <div className="vs-storybook-print__page vs-storybook-print__page--left">
                  <div className="vs-storybook__page-content">
                    {isValidElement(leftPage)
                      ? cloneElement<IVsStorybookProps>(
                          leftPage as ReactElement
                        )
                      : leftPage}
                  </div>
                </div>
              )}
              {/* 右页 */}
              {rightPage && (
                <div className="vs-storybook-print__page vs-storybook-print__page--right">
                  <div className="vs-storybook__page-content">
                    {isValidElement(rightPage)
                      ? cloneElement<IVsStorybookProps>(
                          rightPage as ReactElement
                        )
                      : rightPage}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export interface StoryPrintBoxRef {
  reactToPrintFn: () => void;
}

interface StoryPrintBoxProps {
  list: IDataItem[];
  filename?: string;
}

export const StoryPrintBox = forwardRef<StoryPrintBoxRef, StoryPrintBoxProps>(
  ({ list, filename }, ref) => {
    const { reactToPrintFn, contentRef } = usePrint(list, true, filename);

    useImperativeHandle(ref, () => ({
      reactToPrintFn,
    }));

    return (
      <div>
        {/* <Button onClick={() => reactToPrintFn()}>打印Storybook</Button> */}
        <div className="fixed top-0 left-0 z-[-999]">
          <div ref={contentRef}></div>
          {/* <VsStoryBookPrint list={dataAdaptor(list)} /> */}
        </div>
      </div>
    );
  }
);

export default StoryPrintBox;
