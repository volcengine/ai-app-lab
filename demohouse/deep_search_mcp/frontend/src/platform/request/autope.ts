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

import { request as requestCore, IBaseParams, IOptions } from '@/utils/request';
import globalVar, { AutoPEApiVersion, IS_DEV } from '@/platform/globalVar';
import AutoPEServiceClass from '@bam/autope';

export type ServiceAdapter<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => Promise<any> ? T[K] : never;
};
/** 提取 idl Service 中 Promise 响应类型中的 Result 字段作为返回值 */
export type ExtractServiceResult<Service extends Record<string, never | ((...args: any[]) => Promise<any>)>> = {
  [k in keyof Service]: (...params: Parameters<Service[k]>) => Promise<Awaited<ReturnType<Service[k]>>['Result']>;
};

console.log(globalVar, 'globalVar outer');
const VOLC_TARGET = IS_DEV ? '' : 'https://console.volcengine.com';

const request = (params: IBaseParams, opts: IOptions) =>
  requestCore(params, {
    hasProject: true,
    projectName: globalVar.PROJECT_NAME,
    ...opts,
  });

export const AutoPEService = new AutoPEServiceClass({
  baseURL: (path: string) => {
    const action = path.split('/')[2];
    const url = `${VOLC_TARGET}/api/top/${globalVar.SERVICE_NAME}/${globalVar.TOP_REGION}/${AutoPEApiVersion}/${action}`;
    return url;
  },
  request: request as any,
}) as unknown as ExtractServiceResult<ServiceAdapter<AutoPEServiceClass<unknown>>>;
