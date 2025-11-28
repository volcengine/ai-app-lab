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
  IDataCoverItem,
  IDataItem,
  IDataPageImageItem,
  IDataPageTextItem,
  IVsStorybookPage,
} from "../types";

export const dataAdaptor = (list: IDataItem[]) => {
  const len = list.length;
  return list.reduce<IVsStorybookPage[]>((acc, item, index) => {
    // 封面
    if (item.isCover) {
      acc.push({
        key: item.id,
        showTitle: true,
        ...item,
      } satisfies IDataCoverItem);
    } else {
      // 左侧图片页
      acc.push({
        id: item.id,
        key: `${item.id}-img`,
        url: item.url,
      } satisfies IDataPageImageItem);
      // 右侧正文
      acc.push({
        id: item.id,
        key: `${item.id}-text`,
        text: item.text,
        isLastPage: index === len - 1,
        pageNumber: index,
        pageTotal: len - 1,
      } satisfies IDataPageTextItem);
    }
    return acc;
  }, []);
};

/**
 * 组件内部通过number来表示页面， 对外组件使用索引展示
 * */
export const currentPageToPageNumberAdaptor = (num: number) => {
  // 封面图
  if (num === 1) {
    return 0;
  }
  return Math.ceil((num - 1) / 2);
};

/**
 * 总数适配器
 * */
export const totalPageAdaptor = (total: number) => {
  return Math.floor(total / 2);
};

/**
 * 数据适配器
 * */
export const stateAdaptor = {
  list: dataAdaptor,
  currentPage: currentPageToPageNumberAdaptor,
  totalPage: totalPageAdaptor,
};

/**
 * 方法适配器
 * @param pageNum 页码 -1为封面， 其他定义为索引
 * */
export const indexToPageAdaptor = (index: number) => {
  if (index === 0) {
    return 1;
  }
  return index * 2 + 1;
};
