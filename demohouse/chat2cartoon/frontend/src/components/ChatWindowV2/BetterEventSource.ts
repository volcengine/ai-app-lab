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

import { ErrorCodes } from '@/constant';

import { SSEError } from './sendMessageAndUpdateState';

type Listener = (data?: any) => void;

export interface IResponseMetadata {
  Action: string;
  Region: string;
  RequestId: string;
  Service: string;
  Version: string;
  Error: {
    Code: string;
    CodeN: number;
    Message: string;
  };
}

interface BetterEventSourceOptions {
  headers?: Record<string, string>;
  body?: BodyInit | null;
  abortSignal?: AbortSignal;
}

const removePrefix = (text: string) => {
  if (text.startsWith('data:')) {
    return text.slice(5);
  }

  return text;
};

class JsonStreamParser {
  private buffer = '';

  private readonly callback: JsonParseCallback;

  constructor(callback: JsonParseCallback) {
    this.callback = callback;
  }

  receiveChunk(chunk: string) {
    this.buffer += chunk;

    try {
      const json = JSON.parse(chunk);
      if (json?.ResponseMetadata?.Error) {
        this.callback(json);
        return;
      }
    } catch {}

    // 尝试找到一个完整的JSON对象边界
    let jsonBoundary = this.findJsonBoundary();

    while (jsonBoundary !== -1) {
      // 截取并处理当前的JSON对象
      const rawJson = removePrefix(this.buffer.substring(0, jsonBoundary));
      // 更新缓冲区，移除已处理的部分
      this.buffer = this.buffer.substring(jsonBoundary + 4);

      if (rawJson === '[DONE]') {
        return;
      }

      try {
        // 尝试解析JSON对象并调用回调函数
        const json = JSON.parse(rawJson);
        this.callback(json);
      } catch (error) {
        console.log(jsonBoundary);
        console.log(rawJson);
        console.error('Failed to parse JSON', error);
      }

      // 继续寻找下一个JSON对象的边界
      jsonBoundary = this.findJsonBoundary();
    }
  }

  private findJsonBoundary(): number {
    return this.buffer.indexOf('\r\n\r\n');
  }
}

export class EventSourceOpenFail {
  code?: string;
  message?: string;
  ResponseMetadata: IResponseMetadata | undefined;
  logid?: string;
  constructor(code: string, message: string, logid: string, ResponseMetadata?: IResponseMetadata) {
    this.code = code;
    this.message = message;
    this.logid = logid;
    this.ResponseMetadata = ResponseMetadata;
  }
}

export class BetterEventSource {
  private url: string;

  private eventListeners: Map<string, Listener[]>;

  private options: BetterEventSourceOptions;

  private headersReceived: Headers | null = null;

  constructor(url: string, options?: BetterEventSourceOptions) {
    this.url = url;
    this.options = options || {};
    this.eventListeners = new Map();
  }

  private fetchStream() {
    fetch(this.url, {
      method: 'POST',
      headers: this.options.headers,
      body: this.options.body,
      credentials: 'omit',
      signal: this.options.abortSignal,
    })
      .then(response => {
        // 这意味着连接失败
        if (!response.ok) {
          response
            .json()
            .then(resp => {
              const code = resp?.ResponseMetadata?.Error?.Code;
              // SEED 层面审核问题
              if (code === ErrorCodes.ReqTextExistRisk) {
                this.emit(
                  'error',
                  new SSEError(
                    ErrorCodes.ReqTextExistRisk,
                    resp?.ResponseMetadata?.Error?.Message || 'Unknown Error',
                    resp?.ResponseMetadata?.RequestId,
                  ),
                );
              } else if (code === ErrorCodes.BFFPromptTextExistRisk) {
                const sseError = new SSEError(
                  code,
                  resp?.ResponseMetadata?.Error?.Message || 'Unknown Error',
                  resp?.ResponseMetadata?.RequestId,
                );
                this.emit('error', sseError);
              } else {
                this.emit(
                  'error',
                  new EventSourceOpenFail(
                    code,
                    'Failed to open EventSource',
                    resp?.ResponseMetadata?.RequestId,
                    resp?.ResponseMetadata,
                  ),
                );
              }
            })
            .catch(e => {
              this.emit(
                'error',
                new EventSourceOpenFail(
                  e?.ResponseMetadata?.Error?.Code,
                  'Failed to open EventSource',
                  (e?.ResponseMetadata?.RequestId || e.headers.get('x-tt-logid')) ?? undefined,
                  e?.ResponseMetadata,
                ),
              );
            });

          return;
        }

        this.headersReceived = response.headers;
        this.emit('headerReceived', this.headersReceived);
        const reader = response.body?.getReader();
        return this.readStream(reader);
      })
      .catch(error => {
        this.emit('error', error);
      });
  }
  private async readStream(reader?: ReadableStreamDefaultReader<Uint8Array>) {
    if (!reader) {
      return;
    }
    const jsonStreamParser = new JsonStreamParser(json => {
      // 兼容高代码 sse chunk 返回了 top 错误格式的 error
      if (json?.ResponseMetadata?.Error) {
        this.emit('error', {
          logid: json?.ResponseMetadata?.RequestId,
          code: json?.ResponseMetadata?.Error?.Code,
          message: json?.ResponseMetadata?.Error?.Message,
        });
      } else {
        this.emit('message', json);
      }
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          this.emit('end');
          break;
        }
        const text = new TextDecoder().decode(value);
        let response: string | null = null;

        if (text.startsWith('data:')) {
          response = text.slice(5);
          // remove the data: prefix
        } else {
          response = text;
        }

        jsonStreamParser.receiveChunk(response);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  addEventListener(event: string, listener: Listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(listener);
    if (event === 'message' && this.eventListeners.get(event)?.length === 1) {
      // Start the fetch stream only when the first message listener is added
      this.fetchStream();
    }
  }

  removeEventListener(event: string, listener: Listener) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  getHeader(name: string): string | null {
    return this.headersReceived?.get(name) || null;
  }
}

type JsonParseCallback = (json: any) => void;
