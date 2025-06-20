// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License. 
import { FC, PropsWithChildren, useState } from 'react';

import { Message } from '@arco-design/web-react';

import { QueryContext, QueryParamsType } from './context';
import { ImageTosPathItem } from '../../types/ImageTosPathList';
import { ERequestType, queryRequest } from '../../api';
import { SearchImageRequest, SearchImageResponse } from '../../types/searchImage';
import { globalEnv } from '@/constant';
export const QueryProvider: FC<PropsWithChildren<{ userId: string }>> = ({ children, userId }) => {
  // 检索的文本和图片
  const [queryParams, setQueryParams] = useState<QueryParamsType | null>(null);
  // 检索加载
  const [loading, setLoading] = useState<boolean>(false);

  // 检索结果的图片列表
  const [imageList, setImageList] = useState<ImageTosPathItem[]>([]);

  // 发送检索请求
  async function handleSendQuery(props: QueryParamsType) {
    setQueryParams(props);
    const { text, image } = props;
    setLoading(true);
    try {
      // 发送检索请求
      const res = await queryRequest<SearchImageRequest, SearchImageResponse>(ERequestType.SEARCH_IMAGE, {
        data: {
          user_id:globalEnv.ARK_DEFAULT_USER_ID,
          ...(text ? { query: text } : {}),
          ...(image ? { image_tos_path: `tos://${globalEnv.BUCKET_NAME}/${image.objectKey}` } : {}),
        },
      });
      setImageList(res.image_tos_path_list);
    } catch (e: any) {
      console.error(e);
      setImageList([]);
      Message.error('检索失败，请更换图片或文本重新试试吧');
    } finally {
      setLoading(false);
    }
  }

  function clearQueryParams() {
    setQueryParams(null);
  }

  return (
    <QueryContext.Provider value={{ userId, handleSendQuery, loading, imageList, queryParams, clearQueryParams }}>
      {children}
    </QueryContext.Provider>
  );
};
