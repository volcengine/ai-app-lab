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

import { globalEnv } from '@/constant';
import TosClient from '@volcengine/tos-sdk';

const TOP_REGION = 'cn-beijing';
const TOS_ENDPOINT = `tos-${TOP_REGION}.volces.com`;

const tosClient = new TosClient({
  region: TOP_REGION,
  endpoint: TOS_ENDPOINT,
  accessKeyId: globalEnv.ARK_ACCESS_KEY ?? '',
  accessKeySecret: globalEnv.ARK_SECRET_KEY ?? '',
});

export const signedSource = async (obj: any) => {
  await tosClient.getBucketAcl(obj.BucketName);
  const url = await tosClient.getPreSignedUrl({
    method: 'GET',
    bucket: obj.BucketName,
    key: obj.ObjectKey,
    expires: 60 * 60 * 24 * 7,
  });
  return url;
}
