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
