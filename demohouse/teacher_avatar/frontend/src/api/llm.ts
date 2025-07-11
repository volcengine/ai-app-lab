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

import { CAMER_MODE } from '@/types';
import { IMessage } from '@/pages/entry/routes/recognition-result/components/AnswerCard';

interface LLMRequestParams {
  messages?: Message[];
}

interface Message {
  role: string; // 'user' | 'bot';
  content: any;
}

interface LLMResponseChunk {
  text: string;
  isLast: boolean;
}

interface ChatDelta {
  content?: string;
  role?: string;
  reasoning_content?: string;
}

interface ChatChoice {
  delta: ChatDelta;
  index: number;
  finish_reason: string | null;
}

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
}

const VLM_MODEL = process.env.VLM_MODEL;
const TEACHER_MODEL = process.env.TEACHER_MODEL;
const TEACHER_APIKEY = process.env.TEACHER_APIKEY;
const DEEP_SEEK_MODEL = process.env.DEEP_SEEK_MODEL;

export class LLMApi {
  static TAG = 'LLMApi';
  private static BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

  static async streamResponse(
    response: Response
  ): Promise<{
    cb: (
      onVlmData: (text: string) => void,
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: (deepseekBuffer?: string) => void
    ) => void;
    abort: () => void;
  }> {
    const reader = response.body?.getReader();
    const controller = new AbortController();

    const cb = (
      onVLMData: (text: string) => void,
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: (deepseekBuffer?: string) => void
    ) => {
      let reasoningBuffer = '';
      let deepseekBuffer = '';

      async function read() {
        if (!reader) return;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              onComplete?.(deepseekBuffer);
              break;
            }
            const text = new TextDecoder().decode(value);
            const jsonStr = text.replace(/^data: /, '').trim();

            if (jsonStr === '[DONE]') {
              onComplete?.(deepseekBuffer);
              break;
            }

            if (jsonStr) {
              try {
                const json: ChatCompletionChunk = JSON.parse(jsonStr);
                const choice = json.choices[0];
                if (choice) {
                  if (choice.finish_reason) {
                    onComplete?.(deepseekBuffer);
                    break;
                  }
                  const content = choice.delta?.content ?? '';
                  const reasoningContent = choice.delta?.reasoning_content;
                  if (content) {
                    if (reasoningBuffer) {
                      deepseekBuffer += content;
                      onDeepseekData?.(content);
                    } else {
                      onVLMData(content);
                    }
                  }
                  if (reasoningContent) {
                    reasoningBuffer += reasoningContent;
                    onReasoningData?.(reasoningContent);
                  }
                }
              } catch (e) {
                console.error('Failed to parse JSON:', e, 'Raw data:', jsonStr);
              }
            }
          }
        } catch (error) {
          console.error('Stream reading error:', error);
          onComplete?.(deepseekBuffer); // complete on error
        }
      }
      read();
    };

    return {
      cb,
      abort: () => {
        reader?.cancel();
      },
    };
  }

  static async chatStreamResponse(
    response: Response
  ): Promise<{
    cb: (
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: () => void
    ) => void;
    abort: () => void;
  }> {
    const reader = response.body?.getReader();

    const cb = (
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: () => void
    ) => {
      let reasoningBuffer = '';
      async function read() {
        if (!reader) return;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              onComplete?.();
              break;
            }
            const text = new TextDecoder().decode(value);
            const jsonStr = text.replace(/^data: /, '').trim();

            if (jsonStr === '[DONE]') {
              onComplete?.();
              break;
            }

            if (jsonStr) {
              try {
                const json: ChatCompletionChunk = JSON.parse(jsonStr);
                const choice = json.choices[0];
                if (choice) {
                  if (choice.finish_reason) {
                    onComplete?.();
                    break;
                  }
                  const content = choice.delta?.content ?? '';
                  const reasoningContent = choice.delta?.reasoning_content;
                  if (content && reasoningBuffer) {
                    onDeepseekData?.(content);
                  }
                  if (reasoningContent) {
                    reasoningBuffer += reasoningContent;
                    onReasoningData?.(reasoningContent);
                  }
                }
              } catch (e) {
                console.error('Failed to parse JSON:', e, 'Raw data:', jsonStr);
              }
            }
          }
        } catch (error) {
          console.error('Stream reading error:', error);
          onComplete?.();
        }
      }
      read();
    };

    return {
      cb,
      abort: () => {
        reader?.cancel();
      },
    };
  }

  static async VLMChat(image_url: string, mode: CAMER_MODE) {
    const response = await fetch(`${this.BASE_URL}/bots/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEACHER_APIKEY}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: TEACHER_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: image_url,
                },
              },
            ],
          },
        ],
        stream: true,
        ...(mode === CAMER_MODE.HOMEWORK_CORRECTION
          ? {
              metadata: {
                mode: 'correct',
              },
            }
          : {}),
      }),
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { cb, abort } = await this.streamResponse(response);
    return {
      cb,
      handle: { abort }, // Keep handle object for aborting
    };
  }

  static async Chat(messages: IMessage[]) {
    const response = await fetch(`${this.BASE_URL}/bots/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEACHER_APIKEY}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: TEACHER_MODEL,
        messages,
        stream: true,
        metadata: {
          mode: 'chat', // 闲聊
        },
      }),
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { cb, abort } = await this.chatStreamResponse(response);
    return {
      cb,
      handle: { abort },
    };
  }
}

const constructUserMessage = (question: string, image?: string, modelType: 'VLM' | 'DS' = 'VLM') => {
  if (image && modelType === 'VLM') {
    return {
      role: 'user',
      content: [
        {
          type: 'text',
          text: question
        },
        {
          type: 'image_url',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          image_url: {
            url: image
          }
        }
      ]
    };
  } else {
    return {
      role: 'user',
      content: question
    };
  }
};


export type { LLMRequestParams, LLMResponseChunk };
