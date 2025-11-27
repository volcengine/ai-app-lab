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

import { forwardRef, ReactNode } from "react";
import "./index.scss";
import { IStoryBookMobilePageContent } from "./types";
import { VsStoryBookMobilePageContent } from "./page";

/**
 * 移动端故事书页面item
 * */
export const VsStoryBookMobilePageItem = forwardRef<
  HTMLDivElement,
  IStoryBookMobilePageContent
>((props, ref) => (
  <VsStoryBookMobilePageItemContainer ref={ref}>
    <VsStoryBookMobilePageContent {...(props as IStoryBookMobilePageContent)} />
  </VsStoryBookMobilePageItemContainer>
));

/**
 * 带有肌理的移动端故事书页面item容器
 * */
export const VsStoryBookMobilePageItemContainer = forwardRef<
  HTMLDivElement,
  { children: ReactNode }
>(({ children }, ref) => {
  return (
    <div
      ref={ref}
      className="vs-storybook-mobile__page-container overflow-hidden pt-[32px] pb-[40px] px-[24px]"
    >
      {children}
    </div>
  );
});
