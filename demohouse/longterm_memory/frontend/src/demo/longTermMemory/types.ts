export interface Message {
  id: string;
  logId?: string;
  content: string;
  role: 'assistant' | 'user' | 'divider';
  memories?: string[];
  finish: boolean;
}

export interface Memory {
  id: string;
  content: string;
  updatedAt: string;
  createdAt: string;
  displayTime?: string;
}

export interface ChatState {
  messages: Message[];
  memories: Memory[];
  isLoading: boolean;
  isMemoryUpdating: boolean;
  memoryUpdatePhase: 'idle' | 'reasoning' | 'updating' | 'complete';
  inputValue: string;
}
