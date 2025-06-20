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

import { useContext, useState } from 'react';

import { Button, Image } from '@arco-design/web-react';
import { useRequest } from 'ahooks';

import { UploadTosFile } from './components/UploadTosFile';
import { ERequestType, queryRequest } from '../../api';
import { ImageTosPathListResponse } from '../../types/ImageTosPathList';
import { UploadTosContext } from '../../store/UploadTos/context';
import { IconLoading, IconRefresh } from '@/images';
import { globalEnv } from '@/constant';
import { parseTosPath } from '@/utils/parseTosPath';

export const MyGallery = () => {
  const { getPreSignedUrl } = useContext(UploadTosContext);
  // 获取图片列表
  const { loading, runAsync, data } = useRequest(
    async () => {
      const res = await queryRequest<{ user_id: number }, ImageTosPathListResponse>(ERequestType.LIST_IMAGE, {data:{
        user_id:Number(globalEnv.ARK_DEFAULT_USER_ID)
      }});
      const list = res?.image_tos_path_list;
      // 用户图片通过bff过签
      return Promise.all(list.user.map(async({image_tos_path,...res})=>({
        ...res,
        displayUrl:await getPreSignedUrl(parseTosPath(image_tos_path).key)
      })))
    },
    {
      debounceWait: 500,
    },
  );
  const [previewImage, setPreviewImage] = useState<string | null>('');
  return (
    <div className="w-full h-full bg-white rounded-lg flex flex-col">
      <div className="px-6 py-4 border-b-[1px] border-b-gray-200">
        <div className="text-base font-medium flex justify-between items-center">
          <div>我的图库</div>
          <Button
            icon={<IconRefresh />}
            onClick={() => {
              runAsync();
            }}
          >
            刷新
          </Button>
        </div>
      </div>

      <div className="flex-1">
        {loading && (
          <div className="flex justify-center items-center w-full h-full">
            <IconLoading />
          </div>
        )}
        {!loading && (
          <div className="w-full h-full grid grid-cols-2 2xl:grid-cols-3 gap-[6px] max-h-full overflow-auto contain-size  content-start px-6 py-5">
            {data?.map(img => (
              <img
                key={img.__AUTO_ID__}
                className="w-[140px] aspect-square object-contain cursor-pointer"
                onClick={() => {
                  setPreviewImage(img.displayUrl ?? null);
                }}
                src={img.displayUrl}
              ></img>
            ))}
          </div>
        )}
      </div>
      <Image.Preview
        src={previewImage ?? ''}
        visible={Boolean(previewImage)}
        onVisibleChange={visible => {
          if (!visible) {
            setPreviewImage(null);
          }
        }}
      />
      <div className="mt-1 text-gray-secondary text-xs text-opacity-60 text-center">仅展示前20张图片</div>
      <div className="text-center py-[20px]">
        <UploadTosFile
          refreshImage={() => {
            runAsync();
          }}
        />
        <div className="mt-[11px] text-gray-secondary text-xs text-opacity-60">
          想检索自己的小动物？快来上传你的宠物图片吧～
        </div>
      </div>
    </div>
  );
};
