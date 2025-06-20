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

import { FC, PropsWithChildren } from 'react';

import { UploadTosContext } from './context';
import TosClient from '@volcengine/tos-sdk';
import { globalEnv } from '@/constant';
import { Message } from '@arco-design/web-react';
const client = new TosClient({
  accessKeyId: globalEnv.AK,
  accessKeySecret:globalEnv.SK,
  region: globalEnv.REGION, // 填写 Bucket 所在地域。以华北2（北京)为例，则 "Provide your region" 填写为 cn-beijing。
  endpoint: globalEnv.ENDPOINT, // 填写域名地址
});
export const UploadTosProvider: FC<PropsWithChildren> = ({  children }) => {
  //  上传图片到tos
  const uploadTos=async (file:Blob,objectKey:string,temp=false)=>{
    try{
      console.log(objectKey)
    return client.putObject({
      bucket: globalEnv.BUCKET_NAME,
      key: objectKey,
      body: file,
      headers:{
        Expires:temp?"3":"-1"
      }
    });
    }catch(e){
      console.error(e)
      Message.error("tos上传失败")
    }
  }
  // 过签tos文件
  const getPreSignedUrl=async(objectKey:string)=>{
     return client.getPreSignedUrl({
      // method 支持 'GET'/'PUT'/'HEAD'/'DELETE'
      method: 'GET',
      bucket: globalEnv.BUCKET_NAME,
      key: objectKey,
    });
  }

  return (
    <UploadTosContext.Provider value={{ getPreSignedUrl,uploadTos }}>
      {children}
    </UploadTosContext.Provider>
  );
};
