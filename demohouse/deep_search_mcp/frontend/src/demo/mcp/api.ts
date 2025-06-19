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
