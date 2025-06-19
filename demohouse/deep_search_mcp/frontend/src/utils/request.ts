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

import { Notification } from '@arco-design/web-react';
/* eslint-disable @typescript-eslint/naming-convention */
import axios, {
  type AxiosPromise,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import Cookies from 'js-cookie';
import { get } from 'lodash';

import { AxiosCancelErrMsg, isAxiosError } from './axios';

type TObject = Record<string | number | symbol, any>;

export interface IBaseParams {
  url: string;
  method: 'GET' | 'DELETE' | 'POST' | 'PUT' | 'PATCH';
  // body
  data?: TObject;
  headers?: Partial<Record<string, string>>;
}

export interface IParams extends IBaseParams {
  projectName?: string;
  projectNameKey?: string;
}

export interface IOptions {
  rawData?: boolean;
  showError?: boolean;
  axiosConfig?: AxiosRequestConfig;
  hasProject?: boolean;
  projectName?: string;
}

export interface TOPResponse {
  // ResponseMetadata: IResponseMetadata;
  ResponseMetadata: any;
}

export const getDEFAULT_ERROR_MESSAGE = () => '系统异常，请联系客服或重试';

/** 自定义的请求错误码 */
export enum ERequestErrorCode {
  NoResponse = -1,
}
export const getERROR_MESSAGE_BY_HTTP_CODE = (httpCode: number): string => {
  switch (httpCode) {
    case 400:
      return '非法请求参数';
    case 403:
      return '未经授权访问';
    case 404:
      return '请求的资源未找到';
    case 500:
      return '服务器内部错误，请联系客服或重试';
    case 502:
      return '上游服务错误';
    case 504:
      return '上游服务超时';
    case ERequestErrorCode.NoResponse:
      return '当前网络异常，请稍后进行重试';
    default:
      return getDEFAULT_ERROR_MESSAGE();
  }
};

type Request = <T>(params: IParams, opts?: IOptions) => AxiosPromise<T>;

const defaultAxiosConfig: AxiosRequestConfig = {
  withCredentials: true,
  method: 'post',
  // 超时时间 5min
  timeout: 5 * 60 * 1000,
};

/**
 * 处理 axios response，进行错误上报，弹窗提示
 * @param response
 * @param showError
 */
export const handleResponse = (
  {
    response,
  }: {
    response: AxiosResponse<TOPResponse>;
    payload: TObject;
  },
  showError: boolean,
) => {
  const { data, headers } = response ?? {};
  const { ResponseMetadata } = data ?? {};
  // 从请求 header 中获取真实的后端状态码
  const httpStatusCode = Number(headers?.['x-real-status'] || response?.status);
  if (showError && ResponseMetadata?.Error) {
    if (ResponseMetadata?.Error?.Code === 'AccessDenied') {
      Notification.error({
        content: ResponseMetadata.Error.Message,
      });
      // 4xx warning 弹窗、5xx error 弹窗
    } else if (httpStatusCode >= 500) {
      Notification.error({
        content: ResponseMetadata.Error.Message,
      });
    } else {
      Notification.warning({
        content: ResponseMetadata.Error.Message,
      });
    }
  }
};
/** 处理接口异常逻辑 */
export const handleResponseError = (
  {
    response,
    payload,
  }: {
    response: any;
    payload: TObject;
  },
  showError: boolean,
) => {
  if (!showError) {
    return;
  }
  if (isAxiosError(response)) {
    // axios error 处理
    if (response.response) {
      // 存在响应
      const responseMetadata = get(response.response, 'data.ResponseMetadata');
      if (!responseMetadata) {
        // 处理没有 ResponseMetadata 的异常情况

        const rawHttpStatus =
          response.response.headers?.['x-real-status'] ??
          response.response.status;
        const httpStatus = Number(rawHttpStatus);
        Notification.warning({
          id: 'unknownResponse',
          content: getERROR_MESSAGE_BY_HTTP_CODE(httpStatus),
        });
      } else {
        // 有 metadata 使用 handleResponse 处理
        handleResponse({ response: response.response, payload }, showError);
      }
    } else {
      // 无响应内容
      Notification.warning({
        id: 'noResponse',
        content: getERROR_MESSAGE_BY_HTTP_CODE(ERequestErrorCode.NoResponse),
      });
    }
  } else {
    // 非 axios error
    if ((response as any)?.message === AxiosCancelErrMsg) {
      // AbortController 取消请求
      // 无需报错
    } else {
      if (response?.data || response?.headers) {
        // response 类型为 AxiosResponse
        handleResponse({ response, payload }, showError);
      } else {
        // 未知报错原因
        Notification.warning({
          id: 'unknownError',
          content: getDEFAULT_ERROR_MESSAGE(),
        });
      }
    }
  }
};

export const request: Request = async (params, options = {}) => {
  const {
    data = {},
    url,
    projectName,
    projectNameKey = 'ProjectName',
  } = params;

  const axiosConfig: AxiosRequestConfig = {
    ...defaultAxiosConfig,
    ...options.axiosConfig,
    headers: {
      'Content-Type': 'application/json',
      'X-Csrf-Token': Cookies.get('csrfToken') || '',
      ...(options.axiosConfig?.headers || {}),
    },
    data,
    url,
  };

  const { hasProject = true, showError = true } = options;

  if (hasProject && !projectName) {
    data[projectNameKey] = undefined;
  }

  try {
    const result = await axios(axiosConfig);
    // 请求成功，但返回值内可能有 Error Message
    // 故 axios 成功时也需要判断是否进行错误上报
    handleResponse({ payload: data, response: result }, showError);
    if (options.rawData) {
      return Promise.resolve(result);
    }
    return Promise.resolve((result?.data as any)?.Result);
  } catch (error: any) {
    handleResponseError({ payload: data, response: error }, showError);
    return Promise.reject(error);
  }
};

export const requestArkBff = (action: string) => {
  const Version = '2024-10-01';
  const url = `https://arkbff-cn-beijing.console.volcengine.com/api/${Version}/${action}`;
  return (data: any, options?: IOptions) =>
    request(
      {
        url,
        method: 'POST',
        data,
      },
      options,
    );
};

export const requestBff = (action: string) => {
  const Version = '2024-01-29';
  const url = `https://ml-platform-api.console.volcengine.com/ark/bff/api/cn-beijing/${Version}/${action}`;
  return (data: any, options: IOptions) =>
    request(
      {
        url,
        method: 'POST',
        data,
      },
      options,
    );
};
