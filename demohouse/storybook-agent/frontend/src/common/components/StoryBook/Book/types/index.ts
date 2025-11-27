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

import { ReactNode } from 'react';

export interface IVsStorybookPage {
  /** 页面唯一标识 */
  key: string;
  [k: string]: any;
}

export interface VSStoryBookProviderProps {
  list: IDataItem[];
  children?: ReactNode;
}

export type IDataItem = IDataCoverItem | IDataPageImageItem | IDataPageTextItem;

interface IDataBaseItem {
  id: string;
  /**
   * 是否是最后一页， 最后一页要展示重新阅读按钮
   * */
  isLastPage?: boolean;
  [key: string]: any;
}

export interface IDataCoverItem extends IDataBaseItem {
  isCover: true;
  url: string;
  /**
   * 标题
   * */
  title?: string | ReactNode;
  /**
   * 是否展示标题内容
   * */
  showTitle?: boolean;
  // /**
  //  * 模型名称
  //  * */
  // model?: string;

  /**
   * 封面自定义内容扩展插槽
   * */
  slot?: ReactNode;
  /**
   * 封面渲染类型
   * image: 图片渲染
   * background: css 背景渲染
   * */
  coverRenderType?: 'image' | 'background';
}

export interface IDataPageImageItem extends IDataBaseItem {
  isCover?: false;
  url?: string;
  slot?: ReactNode | string;
}

export interface IDataPageTextItem extends IDataBaseItem {
  isCover?: false;
  text?: string;
  onClickReadAgain?: () => void;
  readAgainButtonText?: string;
  pageNumber?: number;
  pageTotal?: number;
  slot?: ReactNode | string;
}
