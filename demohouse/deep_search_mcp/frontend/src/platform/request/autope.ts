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
