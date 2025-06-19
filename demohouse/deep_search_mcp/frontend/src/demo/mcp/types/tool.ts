export interface Tool {
  id: string;
  type: string;
  name: string;
  icon: string;
  description: string;
  content: string;
  required?: boolean;
  disabled?: boolean;
}
export interface ToolType {
  name: string;
  description: string;
}

export interface ToolTree {
  name: string;
  description: string;
  children: Tool[];
}
