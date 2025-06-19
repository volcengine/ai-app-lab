import { useChatConfigStore } from '../store/ChatConfigStore/useChatConfigStore';

export const getChatMcpServers = () => {
  const { toolList, enableToolList } = useChatConfigStore.getState();
  // 找出没开启的

  const mcpServers = toolList.reduce(
    (acc, tool) => {
      acc[tool.id] = { disable: !enableToolList.some(enableTool => enableTool.id === tool.id) };
      return acc;
    },
    {} as Record<string, { disable: boolean }>,
  );

  return {
    ...mcpServers,
  };
};
