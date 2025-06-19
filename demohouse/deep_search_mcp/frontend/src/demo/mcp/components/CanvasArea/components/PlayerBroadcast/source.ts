import Search from '@/demo/mcp/assets/search.png';
import { MCP_TOOL_CALL_MAP } from '@/demo/mcp/const';

interface Broadcast {
  type: string;
  name: string;
  iconSrc: string;
}

export const getBroadcastInfo = (type: string, functionName?: string): Broadcast => {
  const tool = MCP_TOOL_CALL_MAP[type as keyof typeof MCP_TOOL_CALL_MAP];

  return (
    tool || {
      type,
      name: type,
      iconSrc: Search,
    }
  );
};
