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

import { assign, createMachine } from 'xstate';

import { IWatchAndChatContext } from './types';

export const watchAndChatMachine = createMachine<IWatchAndChatContext>({
  context: {
    videoStatus: 'paused' as const,
    sseDone: false,
    //
    userPrompt: '',
    imgB64: '',
  },
  id: 'WatchAndChat',
  initial: 'idle',
  on: {
    EXIT: {
      target: 'idle',
      actions: [
        {
          type: 'stopBotAudio',
        },
        {
          type: 'stopRecord',
        },
        {
          type: 'releaseMedia',
        },
      ],
    },
  },
  states: {
    idle: {
      on: {
        INIT: {
          target: 'INITING',
        },
      },
    },
    NO_ACCESS: {
      on: {
        INIT: {
          target: 'INITING',
        },
      },
    },
    INITING: {
      entry: {
        type: 'loadVideo',
      },
      invoke: {
        onDone: {
          target: 'BotWelcome',
        },
        onError: {
          target: 'NO_ACCESS',
        },
        src: 'getUserMedia',
      },
    },
    BotWelcome: {
      invoke: {
        onDone: {
          target: '#WatchAndChat.Chat.UserSpeaking',
        },
        src: 'playBotOpeningRemark',
      },
    },
    Chat: {
      initial: 'UserSpeaking',
      on: {
        WatchVideo: {
          target: '#WatchAndChat.VideoPlaying',
          actions: [
            {
              type: 'stopRecord',
            },
            {
              type: 'stopBotAudio',
            },
            {
              type: 'playVideo',
            },
          ],
        },
      },
      states: {
        UserSpeaking: {
          invoke: {
            onDone: {
              target: 'BotThinking',
              actions: [
                assign({
                  userPrompt: (context, event) => event.data,
                }),
                {
                  type: 'captureFrame',
                },
              ],
            },
            src: 'recognizeUserAudioText',
          },
          entry: [
            {
              type: 'pauseVideo',
            },
          ],
        },
        BotThinking: {
          on: {
            AUDIO_RECEIVE: {
              target: 'BotSpeaking',
              actions: {
                type: 'updateAudioData',
              },
            },
          },
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          invoke: {
            src: 'botChatCompletion',
            onDone: {
              actions: [
                assign({
                  sseDone: () => true,
                }),
              ],
            },
          },
          entry: [
            {
              type: 'stopRecord',
            },
            assign({
              sseDone: () => false,
            }),
          ],
        },
        BotSpeaking: {
          on: {
            AUDIO_RECEIVE: {
              target: 'BotSpeaking',
              actions: {
                type: 'updateAudioData',
              },
            },
            SSE_DONE: {
              target: 'BotSpeaking',
              actions: { type: 'markAudioDataFinished' },
            },
          },
          invoke: {
            onDone: {
              target: 'UserSpeaking',
            },
            src: 'playBotAudio',
          },
        },
      },
    },
    VideoPlaying: {
      on: {
        ChatBot: {
          target: '#WatchAndChat.Chat.UserSpeaking',
          actions: {
            type: 'pauseVideo',
          },
        },
      },
    },
  },
});
