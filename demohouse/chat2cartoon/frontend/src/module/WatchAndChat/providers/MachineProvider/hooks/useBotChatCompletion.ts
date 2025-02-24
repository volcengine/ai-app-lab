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

import { useContext } from 'react';

import Cookies from 'js-cookie';

import { IWatchAndChatContext } from '../../../machines/types';
import { WatchAndChatContext } from '../../WatchAndChatProvider/context';
import { PostSSE } from '@/services/PostSSE';

export interface ChatCompletionChunk {
  id: string;
  choices: Choice[];
  created: number;
  model: string;
  object: string;
}

interface Choice {
  delta: Delta;
  index: number;
}

interface Delta {
  content?: string;
  audio?: string;
  role?: string;
}

const makeMessages = (
  text: string,
  b64: string,
  confirmation: string,
  firmUrl: string
) => [
  {
    role: 'assistant',
    content: `phase=Film {"film": {"url": "${firmUrl}"}}`,
  },

  {
    role: 'user',
    content: [
      {
        type: 'text',
        text,
      },
      {
        type: 'text',
        //
        text: `CONFIRMATION ${confirmation}`,
      },
      {
        type: 'image_url',
        image_url: {
          url: b64,
        },
      },
    ],
  },
];

export const useBotChatCompletion = (url: string) => {
  const { chatConfigRef } = useContext(WatchAndChatContext);
  return (ctx: IWatchAndChatContext) => async (send: any) => {
    const { userPrompt, imgB64 } = ctx;
    const { confirmation, videoUrl } = chatConfigRef.current;
    const messages = makeMessages(userPrompt, imgB64, confirmation, videoUrl);
    const data = {
      messages: messages,
      model: '',
      stream: true,
    };
    return new Promise<void>((resolve, reject) => {
      let audioChunks: string[] = [];

      const sendFinalAudioChunk = () => {
        if (audioChunks.length) {
          send({
            type: 'AUDIO_RECEIVE',
            data: audioChunks.join(''),
          });
          audioChunks = [];
        }
      };
      const myHeaders = new Headers();
      myHeaders.append('X-Csrf-Token', Cookies.get('csrfToken') || '');
      myHeaders.append('Content-Type', 'application/json');

      const eventSource = new PostSSE(url, {
        body: JSON.stringify(data),
        headers: myHeaders,
        onMessage: (data) => {
          try {
            const jsonResult = JSON.parse(data) as ChatCompletionChunk;

            const { audio } = jsonResult.choices[0].delta || {};
            audioChunks = audio ? [...audioChunks, audio] : audioChunks;

          } catch (err) {}
        },
        onError: (error) => {
          send({
            type: 'SSE_DONE',
          });
        },
        onEnd: () => {
          sendFinalAudioChunk();
          send({
            type: 'SSE_DONE',
          });
        },
      });
      eventSource.connect();
    });
  };
};
