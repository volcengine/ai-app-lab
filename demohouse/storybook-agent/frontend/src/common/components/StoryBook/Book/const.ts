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

import { createContext } from "react";
import { IDataItem, IVsStorybookPage } from "./types";
import { IVsStorybookSlots } from "..";

export interface IVsStorybookStateContext {
  /**
   * 当前页面索引， 0 为封面
   * */
  pageNum: number;
  currentPage: number;
  totalPage: number;
  list: IVsStorybookPage[];
  /**
   * 原始数据
   * */
  sourceList: IDataItem[];
  isFirstPage: boolean;
  isLastPage: boolean;
  /**
   * 最后一页是否展示重新阅读按钮
   * */
  showReadAgainButton?: boolean;
  /**
   * 是否禁用掉点击进行翻页
   * */
  disableClickPage?: boolean;
}

export interface IVsStorybookAPIContext {
  /**
   * 前往首页封面页
   * */
  goFirstPage: () => void;
  /**
   * 前往最后一页
   * */
  goLastPage: () => void;
  /**
   * 前往指定页
   * @param page 目标页
   * */
  goPage: (page: number) => void;
  /**
   * 前往上一页
   * */
  goPrevPage: () => void;
  /**
   * 前往下一页
   * */
  goNextPage: () => void;
}

export interface IVsStoryBookConfigContext {
  /**
   * 是否开启页脚
   * */
  showPagination?: boolean;
  /**
   * 自定义插槽
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

export const VSStoryBookStateContext =
  createContext<IVsStorybookStateContext | null>(null);

export const VSStoryBookAPIContext =
  createContext<IVsStorybookAPIContext | null>(null);

export const VSStoryBookConfigContext =
  createContext<IVsStoryBookConfigContext | null>({});
