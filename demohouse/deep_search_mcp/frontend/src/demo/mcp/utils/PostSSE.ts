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

import { createParser } from 'eventsource-parser';

export interface CustomError {
  message: string;
  logId?: string;
  code?: string;
}

export interface SSEOptions {
  headers?: Headers;
  body?: string;
  onMessage: (data: string) => void;
  onError?: (error: Error | CustomError) => void;
  onEnd?: () => void;
  onHeader?: (headers: Headers) => void;
}

const isSSEResponse = (response: Response): boolean => {
  const contentType = response.headers.get('Content-Type');
  return contentType?.includes('text/event-stream') ?? false;
};

export class PostSSE {
  private controller: AbortController;
  private url: string;
  private options: SSEOptions;

  constructor(url: string, options: SSEOptions) {
    this.url = url;
    this.options = options;
    this.controller = new AbortController();
  }

  async connect() {
    try {
      const controller = new AbortController();
      this.controller = controller;
      console.log('connect', controller);
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.options.headers,
        body: this.options.body,
        signal: controller.signal,
      });

      if (!isSSEResponse(response)) {
        const resp = await response.json();
        const error = resp?.ResponseMetadata?.Error;
        if (error) {
          this.options.onError?.({ message: error.Message, code: error.Code, logId: resp?.ResponseMetadata.RequestId });
        }
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // 获取并处理响应头
      this.options.onHeader?.(response.headers);

      const parser = createParser({
        onEvent: event => {
          if (event.data === '[DONE]') {
            console.log('onEvent', '[DONE]');
            this.options.onEnd?.();
          } else {
            this.options.onMessage(event.data);
          }
        },
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('onlink', 'done');
          this.options.onEnd?.();
          break;
        }

        const chunk = decoder.decode(value);
        parser.feed(chunk);
      }
    } catch (error) {
      // 由于 abort 导致的错误无需处理
      if ((error as any)?.name === 'AbortError') {
        return;
      }
      console.error('PostSSE error', error);
      this.options.onError?.(error as Error);
    }
  }

  close = () => {
    // 取消请求
    this.controller.abort();
  };
}
