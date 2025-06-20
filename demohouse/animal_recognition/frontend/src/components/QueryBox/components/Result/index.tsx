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

import { useContext, useEffect, useMemo, useState } from 'react';

import { Empty, Image, Popover } from '@arco-design/web-react';
import { useRequest } from 'ahooks';


import { MessageInput } from '../MessageInput';
import { QueryContext } from '@/store/Query/context';
import { UploadTosContext } from '@/store/UploadTos/context';
import { ImageTosPathItem } from '@/types/ImageTosPathList';
import { IconDescription, IconLeft, IconLoading, IconMultipleQuery } from '@/images';
import { parseTosPath } from '@/utils/parseTosPath';

export const Result = () => {
  const { queryParams, handleSendQuery, clearQueryParams, loading: queryLoading, imageList } = useContext(QueryContext);
  const { getPreSignedUrl } = useContext(UploadTosContext);
  const [query, setQuery] = useState(queryParams ?? { text: '', image: null });

  const {
    runAsync,
    data,
    loading: signedLoading,
  } = useRequest(
    async (list: ImageTosPathItem[]) => {
      if (list.length === 0) {
        return [];
      }
      return Promise.all(list.map(async({image_tos_path,...res})=>{
        return {
          ...res,
          displayUrl:await getPreSignedUrl(parseTosPath(image_tos_path).key)
        }
      }))
    },
    {
      manual: true,
    },
  );
  // 处理tos path
  useEffect(() => {
    runAsync(imageList);
  }, [imageList]);
  const loading = useMemo(() => queryLoading || signedLoading, [queryLoading, signedLoading]);
  return (
    <div className="w-full h-full flex">
      <div className="2xl:min-w-[480px] min-w-[360px] px-8 rounded-xl bg-white border border-[rgba(35,35,35,0.08)]">
        <div
          className="py-5 text-lg font-medium cursor-pointer select-none"
          onClick={() => {
            setQuery({
              text: '',
              image: null,
            });
            clearQueryParams();
          }}
        >
          <IconLeft className="mr-3" />
          返回
        </div>
        <MessageInput
          value={query}
          onChange={setQuery}
          handleSend={() => {
            handleSendQuery(query);
          }}
          autoFocus={false}
        />
      </div>
      <div className="px-8 flex-1 h-full flex flex-col">
        <div className="py-5 text-lg font-medium">搜索结果</div>
        <div className="flex-1 h-full">
          {loading && (
            <div className="w-full h-full flex items-center justify-center">
              <IconLoading />
            </div>
          )}
          {!loading && (
            <div className="overflow-y-auto w-full">
              {!data?.length && <Empty />}
              <div className="columns-2 gap-x-4 overflow-auto">
                {data?.map(img => (
                  <div key={img.__AUTO_ID__} className="relative group mb-3">
                    <Popover
                      content={
                        <>
                          <div className="flex gap-x-2 font-medium text-[13px] items-center">
                            <IconMultipleQuery className="text-2xl rounded" />
                            <div>动物识别专家</div>
                          </div>
                          <div className="text-xs text-gray-secondary mt-[5px]">{img.image_introduction}</div>
                        </>
                      }
                    >
                      <div className="w-[83px] py-1 z-10 absolute left-[10px] top-[10px] text-center hidden group-hover:block cursor-pointer bg-black bg-opacity-50 text-white rounded-lg">
                        <IconDescription/>
                        <span className="ml-1">动物介绍</span>
                      </div>
                    </Popover>
                    <Image key={img.__AUTO_ID__} width="100%" className="!w-full hover:!w-full min-h-40" src={img.displayUrl} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
