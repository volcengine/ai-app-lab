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

/* eslint-disable @typescript-eslint/no-empty-function */
import { defineWidget, z } from '@ai-app/agent';
import ChatInterface from '@/components/ChatList';
import { Message } from '@/components/ChatList';
import './index.css';

export default defineWidget({
  autoLoad: false,
  aiMeta: {
    id: 'chat-list',
    description: '对话消息列表',
    input: z.object({
      messages: z.array(
        z.object({
          id: z.number().describe('id'),
          type: z.string().describe('type'),
          content: z.string().describe('content')
        })
      ),
      apiKey: z.array(
        z.string().describe('apiKey')
      )
    })
  },

  render(props) {
    return (
      <div className="h-screen w-screen bg-white flex flex-col">
        <ChatInterface initialMessages={props.messages || []} apiKey={props.apiKey} />
      </div>
    );
  }
});
