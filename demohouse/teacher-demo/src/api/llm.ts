import { appletRequest, StreamEvent, StreamRequestHandle } from '@ai-app/bridge-api';
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

export class LLMApi {
  static TAG = 'LLMApi';
  private static BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
  static VLM_MODEL = '***';
  static TEACHER_MODEL = '***';
  static TEACHER_APIKEY = '***';
  static DEEP_SEEK_MODEL = '***';
  
  static async streamResponse(
    handle: StreamRequestHandle
  ): Promise<
    (
      onVlmData: (text: string) => void,
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: (deepseekBuffer?: string) => void
    ) => void
  > {
    return (
      onVLMData: (text: string) => void,
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: (deepseekBuffer?: string) => void
    ) => {
      // let vlmBuffer = '';
      let reasoningBuffer = '';
      let deepseekBuffer = '';
      handle.on((event: StreamEvent) => {
        if (event.event === 'data') {
          try {
            const dataStr = String(event.data);
            const jsonStr = dataStr.replace(/^data:\s*/, '').trim();

            if (!jsonStr || jsonStr === '[DONE]') {
              onComplete?.();
              return;
            }

            try {
              const json: ChatCompletionChunk = JSON.parse(jsonStr);
              const choice = json.choices[0];

              if (choice) {
                if (choice.finish_reason) {
                  onComplete?.();
                  return;
                }
                const content = choice.delta?.content ?? '';
                const reasoningContent = choice.delta?.reasoning_content;
                if (content) {
                  if (reasoningBuffer) {
                    deepseekBuffer += content;
                    onDeepseekData?.(content);
                    return;
                  } else {
                    onVLMData(content);
                  }
                }
                if (reasoningContent) {
                  reasoningBuffer += reasoningContent;
                  onReasoningData?.(reasoningContent);
                }
              }
            } catch (parseError) {
              console.error('Failed to parse JSON:', parseError, 'Raw data:', jsonStr);
            }
          } catch (e) {
            console.error('Data processing error:', e);
          }
        } else if (event.event === 'complete') {
          onComplete?.(deepseekBuffer);
        } else if (event.event === 'error') {
          throw new Error(`Stream error: ${event.message}`);
        }
      });
    };
  }
  static async chatStreamResponse(
    handle: StreamRequestHandle
  ): Promise<
    (
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: () => void
    ) => void
  > {
    return (
      onReasoningData?: (text: string) => void,
      onDeepseekData?: (text: string) => void,
      onComplete?: () => void
    ) => {
      // let vlmBuffer = '';
      let reasoningBuffer = '';
      // const deepseekBuffer = '';
      handle.on((event: StreamEvent) => {
        if (event.event === 'data') {
          try {
            const dataStr = String(event.data);
            const jsonStr = dataStr.replace(/^data:\s*/, '').trim();

            if (!jsonStr || jsonStr === '[DONE]') {
              onComplete?.();
              return;
            }

            try {
              const json: ChatCompletionChunk = JSON.parse(jsonStr);
              const choice = json.choices[0];

              if (choice) {
                if (choice.finish_reason) {
                  onComplete?.();
                  return;
                }
                const content = choice.delta?.content ?? '';
                const reasoningContent = choice.delta?.reasoning_content;
                if (content) {
                  if (reasoningBuffer) {
                    onDeepseekData?.(content);
                    return;
                  }
                }
                if (reasoningContent) {
                  reasoningBuffer += reasoningContent;
                  onReasoningData?.(reasoningContent);
                }
              }
            } catch (parseError) {
              console.error('Failed to parse JSON:', parseError, 'Raw data:', jsonStr);
            }
          } catch (e) {
            console.error('Data processing error:', e);
          }
        } else if (event.event === 'complete') {
          onComplete?.();
        } else if (event.event === 'error') {
          throw new Error(`Stream error: ${event.message}`);
        }
      });
    };
  }
  static async VLMChat(
    image_url: string,
    // correct 批改
    mode: CAMER_MODE
  ) {
    const handle = await appletRequest({
      url: `${this.BASE_URL}/bots/chat/completions`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.TEACHER_APIKEY}`,
        Accept: 'text/event-stream'
      },
      body: {
        model: this.TEACHER_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: image_url
                }
              }
            ]
          }
        ],
        stream: true,
        ...(mode === CAMER_MODE.HOMEWORK_CORRECTION
          ? {
              metadata: {
                mode: 'correct'
              }
            }
          : {})
      },
      addCommonParams: false,
      streamType: 'sse'
    });

    if (handle.httpCode !== 200) {
      throw new Error(`HTTP error! status: ${handle.httpCode}`);
    }
    return {
      cb: await this.streamResponse(handle),
      handle
    };
  }

  static async Chat(messages: IMessage[]) {
    const handle = await appletRequest({
      url: `${this.BASE_URL}/bots/chat/completions`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.TEACHER_APIKEY}`,
        Accept: 'text/event-stream'
      },
      body: {
        model: this.TEACHER_MODEL,
        messages,
        stream: true,
        metadata: {
          mode: 'chat' // 闲聊
        }
      },
      addCommonParams: false,
      streamType: 'sse'
    });

    if (handle.httpCode !== 200) {
      throw new Error(`HTTP error! status: ${handle.httpCode}`);
    }

    return {
      cb: await this.chatStreamResponse(handle),
      handle
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
