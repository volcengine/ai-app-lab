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

import { IDataItem } from "../..";

export interface IStoryBookMobileBookProps {
  list?: IDataItem[];
  /**
   * 移动端自定义点击重新阅读
   * */
  onClickReadAgain?: () => void;
  /**
   * 重新阅读按钮文案（接国际化时要配置）
   * */
  readAgainButtonText?: string;
  /**
   * 移动端使用 自定义每页的总数文案 e.g: 共 * 页
   * */
  formatPageTotal: (total: number) => string;
  /**
   * 移动端使用 自定义每页的页码文案 e.g: 第 * 页
   * */
  formatPageNumber: (pageNumber: number) => string;
}

export type IStoryBookMobilePageContent = IDataItem & {
  /**
   * 页码
   * */
  pageNum: number;
  /**
   * 总页数
   * */
  pageSize: number;
  /**
   * 自定义页码展示文案 e.g: 第 1 页
   * */
  formatPageNumber: (pageNumber: number) => string;
  /**
   * 自定义总数展示文案 e.g: 共 9 页
   * */
  formatPageTotal: (total: number) => string;
};
