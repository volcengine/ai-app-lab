export interface detectedObject {
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  label: string,
} 
export interface LLMRequestParams {
  messages?: Message[];
}

export interface Message {
  role: string; // 'user' | 'bot';
  content: any;
}

export interface LLMResponseChunk {
  text: string;
  isLast: boolean;
}

export interface ChatDelta {
  content?: string;
  role?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  reasoning_content?: string;
}

export interface ChatChoice {
  delta: ChatDelta;
  index: number;
  finish_reason: string | null;
}
export interface Good {
  名称: string,
  类别: string,
  子类别: string,
  价格: string,
  销量: string,
  图片链接: string,
  mock?: boolean,
}
export interface ActionDetail {
  name: "vector_search",
  count: number,
  tool_details: [
        {
          name: "vector_search",
            output: Good[]
        }
    ]
}
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
  bot_usage:{
    action_details: ActionDetail[]
}
}