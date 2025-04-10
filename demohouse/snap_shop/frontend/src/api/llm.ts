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

import { ActionDetail, ChatCompletionChunk } from '@/types';
import { appletRequest, StreamEvent, StreamRequestHandle } from '@ai-app/bridge-api';



export class LLMApi {
  static TAG = 'LLMApi';
  private static BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
  private static MODEL = 'xxx';
  private static API_KEY = 'xxx'

  static async streamResponse(
    handle: StreamRequestHandle
  ): Promise<
    (
      onData: (val: ActionDetail) => void,
      onComplete?: (val: ActionDetail | null) => void
    ) => void
  > {
    return (
      onData: (val: ActionDetail) => void,
      onComplete?: (val: ActionDetail | null) => void
    ) => {
      // 识别到的商品详情
      let buffer: null | ActionDetail;
      handle.on((event: StreamEvent) => {
        if (event.event === 'data') {
          try {
            const dataStr = String(event.data);
            const jsonStr = dataStr.replace(/^data:\s*/, '').trim();

            if (!jsonStr || jsonStr === '[DONE]') {
              onComplete?.(buffer === null ? null : buffer);
              return;
            }

            try {
              const json: ChatCompletionChunk = JSON.parse(jsonStr);
              const choice = json?.choices[0];
              const output = json?.bot_usage?.action_details[0]?.tool_details[0]?.output;
              if (Array.isArray(output) && output.length) {
                buffer = json.bot_usage.action_details[0];
                onData(json.bot_usage.action_details[0])
              }
              if (choice) {
                if (choice.finish_reason) {
                  onComplete?.(buffer === null ? null : buffer);
                  return;
                }
              }
            } catch (parseError) {
              console.error('Failed to parse JSON:', parseError, 'Raw data:', jsonStr);
            }
          } catch (e) {
            console.error('Data processing error:', e);
          }
        } else if (event.event === 'complete') {
          onComplete?.(buffer === null ? null : buffer);
        } else if (event.event === 'error') {
          throw new Error(`Stream error: ${event.message}`);
        }
      });
    };
  }

  static async Chat(
    image_url: string,
  ) {
    const handle = await appletRequest({
      url: `${this.BASE_URL}/bots/chat/completions`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.API_KEY}`,
        Accept: 'text/event-stream'
      },
      body: {
        model: this.MODEL,
        stream: true,
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
        metadata: {
          search: true
        }
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
}