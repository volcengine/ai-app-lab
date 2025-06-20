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

import { Link, Space } from '@arco-design/web-react';


import { MessageInput } from '../MessageInput';
import { QueryContext, QueryParamsType } from '@/store/Query/context';
import { IconMultipleQuery, IconNewWindows } from '@/images';
import CatImage from '@/images/example/cat.jpg';
import TigerImage from '@/images/example/tiger.jpg';
import PandaImage from '@/images/example/panda.jpg';
import KoalaImage from '@/images/example/koala.jpg';
import { UploadTosContext } from '@/store/UploadTos/context';
import { last,} from 'lodash';
import { useLocalStorageState } from 'ahooks';


const preQuestions = ['成群结队的企鹅', '水面上的天鹅', '湖里的天鹅'];
const preImages: string[] = [CatImage, TigerImage, PandaImage, KoalaImage];

export const Welcome = () => {
  const [queryParams, setQueryParams] = useState<QueryParamsType>({ image: null, text: '' });
  const {uploadTos}=useContext(UploadTosContext)
  const [uploadedImage,setUploadedImage]=useLocalStorageState<string[]>("multiple_query_uploaded_image")
  const { handleSendQuery } = useContext(QueryContext);
  return (
    <div className="w-full h-full flex justify-center items-center relative">
      <div className="mx-8 w-[720px]">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <IconMultipleQuery className="text-[72px]" />
          </div>
          <div>动物识别专家</div>
        </div>
        <MessageInput
          value={queryParams}
          onChange={setQueryParams}
          handleSend={() => {
            handleSendQuery(queryParams);
            setQueryParams({
              image: null,
              text: '',
            });
          }}
          autoFocus
        />
        <div className="mt-4 text-center select-none text-[13px] text-gray-caption">
          <Space>
            <span>可尝试搜索：</span>
            {preQuestions.map(q => (
              <span
                key={q}
                onClick={() => {
                  setQueryParams({
                    image: queryParams.image,
                    text: q,
                  });
                }}
                className="cursor-pointer font-semibold"
              >
                {q}
              </span>
            ))}
          </Space>
        </div>
        <div className="w-auto grid grid-cols-4 gap-x-3 mt-[30px] min-h-[170px]">
          {preImages?.map(img => (
            <img
              src={img}
              key={img}
              onClick={async() => {
                // tos上传的目录
                const objectKey=`example/${last(img.split("/"))??"example.jpg"}`
                if(!uploadedImage?.includes(objectKey)){
                  const imageResponse=await fetch(img)
                  const file=await imageResponse.blob()
                  await uploadTos(file,objectKey)
                }
                // 上传过的示例图片记录下来
                setUploadedImage([...uploadedImage??[],objectKey])
                setQueryParams({
                  image: {
                    objectKey,
                    disPlayUrl:img
                  },
                  text: queryParams.text,
                });
              }}
              className="w-full cursor-pointer aspect-square !object-cover rounded-lg"
            ></img>
          ))}
        </div>
      </div>
      <div className="absolute text-xs bottom-6 text-gray-secondary">
        体验更多自定义多模态检索，请访问
        <Link target="_blank" href="https://console.volcengine.com/vikingdb" className="ml-1 text-xs">
          VikingDB 向量数据库
          <IconNewWindows className="ml-1" />
        </Link>
      </div>
    </div>
  );
};
