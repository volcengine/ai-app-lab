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

import Cookies from 'js-cookie';

import { CustomError, PostSSE } from './utils/PostSSE';

export const startChat = (params: {
  url: string;
  body: string;
  customHeaders?: Record<string, string>;
  onMessage: (data: string) => void;
  onEnd: () => void;
  onHeader: (headers: Headers) => void;
  onError: (error: Error | CustomError) => void;
}) => {
  const { url, body, customHeaders, onMessage, onEnd, onHeader, onError } = params;

  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('X-Csrf-Token', Cookies.get('csrfToken') || '');
  if (customHeaders) {
    Object.entries(customHeaders).forEach(([key, value]) => {
      headers.append(key, value);
    });
  }

  const eventSource = new PostSSE(url, {
    body,
    headers,
    onMessage,
    onError,
    onEnd,
    onHeader,
  });

  eventSource.connect();
  // 返回关闭连接的方法
  return eventSource.close;
};
