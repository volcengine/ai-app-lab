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
