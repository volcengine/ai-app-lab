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

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable max-lines-per-function */


import Cookies from 'js-cookie';

import { ErrorCodes } from '@/constant';

import { finish_reason } from './context';
import { UpdateAssistantResponse } from '.';
import { BetterEventSource, EventSourceOpenFail } from './BetterEventSource';
import { TextContent, ImageContent } from './utils/filterValidMsg';

interface Response {
  choices: Choice[];
  usage?: Usage;
  error?: Error;
  debug_info?: any;
  model?: string;
}

interface Error {
  code: string;
  message: string;
  logid?: string;
}

interface Choice {
  index: number;
  delta: TMessage;
  message: TMessage;
  finish_reason?: finish_reason;
}

interface Usage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;

  first_token_time: number;
  tokens_per_second: number;
  duration: number;
}

interface TMessage {
  content: string;
  role: 'assistant' | 'user';
}

export interface ErrorFromSSE {
  error: {
    code: ErrorCodes;
    message: string;
  };
}

function formatMilliseconds(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return seconds.toFixed(2);
}

const isErrorFromSSE = (data: Response | ErrorFromSSE): data is ErrorFromSSE =>
  Boolean('error' in data && data?.error?.code && data?.error?.message);

type SSEErrorKey = ErrorCodes;
export class SSEError {
  code: ErrorCodes;
  logid?: string;
  message?: string;
  debugInfo: any;

  constructor(code: SSEErrorKey, message: string, logid?: string, debugInfo?: any) {
    this.code = code;
    this.logid = logid;
    this.message = message;
    this.debugInfo = debugInfo;
  }
}

export class BFFTextRiskError extends Error {
  code: ErrorCodes.BFFPromptTextExistRisk | ErrorCodes.BFFResponseTextExistRisk;
  message: string;
  logid?: string;

  constructor(
    code: ErrorCodes.BFFPromptTextExistRisk | ErrorCodes.BFFResponseTextExistRisk,
    message: string,
    logid?: string,
  ) {
    super(message);
    this.code = code;
    this.message = message;
    this.logid = logid;
  }
}

/**
 * 发送消息并更新状态
 * @param url 发送目标
 * @param body
 * @param updateResponseMessage 更新消息状态的函数
 * @param updateDebugStore 更新 debugWindow
 * @param abortSignal 中断信号
 */
export const sendMessageAndUpdateState = (
  url: string,
  body: {
    messages: { content: string | (TextContent | ImageContent)[]; role: 'user' | 'assistant' | 'system' }[];
    model: string;
    stream: boolean;
  },
  updateResponseMessage: UpdateAssistantResponse,
  updateDebugStore: (
    debugInfo: any,
    error?: {
      content: string;
      code: string;
      message: string;
    },
  ) => void,
  abortSignal: AbortSignal,
): Promise<void> => {
  const eventSource = new BetterEventSource(url, {
    body: JSON.stringify(body),
    headers: {
      'X-Csrf-Token': Cookies.get('csrfToken') || '',
      'Content-Type': 'application/json',
    },
    abortSignal,
  });

  let text = '';
  let usage:
      | { duration: string; tokensPerSecond: number; totalTokens: number }
      | {
          duration: string;
          tokensPerSecond: 0;
          totalTokens: number;
          completionTokens: number;
        }
      | undefined,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    logid: string | undefined,
    finish_reason: finish_reason;

  return new Promise((resolve, reject) => {
    eventSource.addEventListener('message', (data: Response) => {
      // todo check 如果error
      if (data?.error) {
        if (isErrorFromSSE(data)) {
          return reject(new SSEError(data.error.code, data.error.message, logid, data?.debug_info));
        }

        // 类型暂时不太好写
        data.error.logid = logid;

        return reject(data.error);
      }

      if (data?.choices?.length) {
        if (data.choices[0].finish_reason) {
          finish_reason = data.choices[0].finish_reason;
        }

        // 最后返回的消息不包含 content字段
        text += data?.choices[0]?.delta?.content ?? data?.choices[0]?.message?.content ?? '';
      }
      if ((!usage && data?.debug_info) || data.usage) {
        usage = data?.debug_info
          ? ({
              tokensPerSecond: data.debug_info?.total_tokens || 0,
              duration: formatMilliseconds(data.debug_info?.duration || 0),
              totalTokens: data.debug_info?.total_tokens || 0,
            } as const)
          : data.usage
          ? ({
              totalTokens: data.usage?.total_tokens || 0,
              completionTokens: data.usage?.completion_tokens || 0,
              duration: formatMilliseconds(0),
              tokensPerSecond: 0,
            } as const)
          : undefined;
      }

      updateResponseMessage({
        content: text,
        finish: Boolean(finish_reason),
        finish_reason,
        usage,
        logid,
        extra: { model: data.model },
      });

      if (data?.debug_info) {
        updateDebugStore(data?.debug_info);
      }
      if (finish_reason) {
        resolve();
      }
    });

    eventSource.addEventListener('error', (error: any) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return reject(error);
      }
      if (error instanceof EventSourceOpenFail) {
        return reject(error);
      }
      const unknowError = String(error);
      if (unknowError.includes('network error')) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return reject({
          code: '', // 没有ErrorCode
          message: 'network error 请求超时',
          logid,
        });
      }
      if (unknowError.includes('Failed to fetch')) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return reject({
          code: '', // 没有ErrorCode
          message: '网络问题，请稍后重试',
          logid,
        });
      }
      logid = error.logid || undefined;
      // eslint-disable-next-line prefer-promise-reject-errors
      return reject({ code: error.code, message: String(error?.message || ''), logid });
    });

    // eventSource.addEventListener('end', () => {
    //   assistantLog.extend('SSE')('end');
    //   // fixme 排查问题时发现 end 时会调用这个方法，是个坑 后续优化
    //   updateResponseMessage({
    //     content: text,
    //     finish_reason,
    //     finish: true,
    //     logid,
    //     usage,
    //   });
    //
    //   resolve();
    // });
  });
};
