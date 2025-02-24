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
