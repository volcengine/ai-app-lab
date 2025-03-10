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
import Cookies from 'js-cookie';

export interface SSEOptions {
  headers?: Headers;
  body?: string;
  onMessage: (data: string) => void;
  onError?: (error: Error) => void;
  onEnd?: () => void;
}

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
      const response = await fetch(this.url, {
        mode: 'cors',
        credentials: 'include',
        method: 'POST',
        headers: {
          ...this.options.headers,
          'X-Csrf-Token': Cookies.get('csrfToken') || '',
          'Content-Type': 'application/json'
        } as any,
        body: this.options.body,
        signal: this.controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const parser = createParser({
        onEvent: event => {
          if (event.data === '[DONE]') {
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
          this.options.onEnd?.();
          break;
        }

        const chunk = decoder.decode(value);
        parser.feed(chunk);
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        return;
      }
      if (this.options.onError) {
        this.options.onError(error as Error);
      } else {
        console.error('SSE Error:', error);
      }
      this.options.onEnd?.();
    }
  }

  close() {
    this.controller.abort();
  }
}
