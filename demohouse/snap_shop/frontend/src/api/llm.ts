import { ActionDetail, ChatCompletionChunk } from "../types";

const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const MODEL = process.env.MODEL;
const API_KEY = process.env.API_KEY;

export class LLMApi {
  static TAG = 'LLMApi';
  private buffer:  null | ActionDetail;

  constructor() {
    this.buffer = null;
  }

  async streamResponse(
    response: Response
  ): Promise<
    (
      onData: (val: ActionDetail | null) => void,
      onComplete?: (val: ActionDetail | null) => void
    ) => void
  > {
    return async (
      onData: (val: ActionDetail | null) => void,
      onComplete?: (val: ActionDetail | null) => void
    ) => {
      const reader = response.body?.getReader();
      if (!reader) {
        return {
          cb: () => {},
        };
      }
      
  
      try {
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            onComplete?.(this.buffer);
            break;
          }
          const text = new TextDecoder().decode(value);
          let jsonStr: string | null = null;
          const idx0 = text.indexOf('data:')
          const idx1 = text.lastIndexOf('data:')
          if (idx0 === idx1) {
            jsonStr = text.slice(5);
          }else if (idx0 !== -1 && idx0 !== idx1) {
            jsonStr = text.slice(idx0 + 5, idx1);
          } else if (jsonStr === '[DONE]') {
            onComplete?.(this.buffer);
            break;
          }
          if(!jsonStr){
            return;
          }
          try{
            
            const json: ChatCompletionChunk = JSON.parse(jsonStr.trim());
            const choice = json?.choices[0];
            const output = json?.bot_usage?.action_details[0]?.tool_details[0]?.output;
            if (Array.isArray(output)) {
              if(output.length){
                this.buffer = json.bot_usage.action_details[0];
                onData(json.bot_usage.action_details[0])
              }else{
                // onData?.(null);
              }
              
              
            }
            if (choice) {
              if (choice.finish_reason) {  
                onComplete?.(this.buffer);
                return;
              }
            }
            
          } catch (e) {
            console.error('Failed to parse JSON:', e, 'Raw data:', text);
          }
  
          
        }
      } catch (error) {
        onComplete?.(null);
      }

      
    };
  }

  async Chat(
    image_url: string,
  ) {
    try{
      const response = await fetch(`${BASE_URL}/bots/chat/completions`,{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          model: MODEL,
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
        }),
      });
  
      if (response.status !== 200) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return {
        cb: await this.streamResponse(response),
      }
    }catch{

    }
    
  }
}