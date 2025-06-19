import { useEffect } from 'react';

import { useChatConfigStore } from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';
import { MCP_TOOL_LIST, MCP_TOOL_TYPE_LIST } from '@/demo/mcp/const';
import { useMcpSelectModalStore } from '@/demo/mcp/store/ChatConfigStore/useMcpSelectModalStore';

import { useConfigStore } from '../store/ConfigStore/useConfigStore';
import { Host } from '../types';
import { useChatInstance } from './useInstance';

export const useInitConfig = ({
  apiPath,
  mcpServerList,
  mcpDebugHelper,
}: {
  apiPath?: string;
  mcpServerList?: string[];
  mcpDebugHelper?: {
    iframeloading: boolean;
    currentDebugMessageId: string;
    tlsDebugPanelVisible: boolean;
    toggleDebugPanel: (botId?: string, logId?: string) => void;
  };
}) => {
  const { setToolList, setEnableToolList, setToolTypes, setApiPath } = useChatConfigStore();
  const { setModalCurrentType, setModalCurrentTool } = useMcpSelectModalStore();
  const { host } = useChatInstance();

  useEffect(() => {
    apiPath && setApiPath(apiPath);
  }, [apiPath]);

  useEffect(() => {
    const createToolList = (mcpServerList: string[], host?: Host) => {
      // 基础工具列表处理
      // 如果传了，从 mcpServerList 进行初始化 如果不在 mcpServerList 中的设置为 diasbled
      const toolList = MCP_TOOL_LIST.map(tool => ({
        ...tool,
        disabled: !mcpServerList.includes(tool.id),
      }));

      // PROCODE环境特殊处理
      if (host === Host.PROCODE) {
        return toolList.map(tool =>
          tool.id === 'knowledgebase' ? { ...tool, description: '在知识库内进行检索的工具。' } : tool,
        );
      }

      return toolList;
    };

    if (!mcpServerList?.length) {
      setToolList(MCP_TOOL_LIST);
      setEnableToolList(MCP_TOOL_LIST);
      setModalCurrentTool(MCP_TOOL_LIST[0]);
    } else {
      const toolList = createToolList(mcpServerList || [], host);
      setToolList(toolList);
      setEnableToolList(toolList.filter(tool => !tool?.disabled));
      setModalCurrentTool(toolList[0]);
    }
    setToolTypes(MCP_TOOL_TYPE_LIST);
    setModalCurrentType('全部');

    return () => {
      setToolList([]);
      setEnableToolList([]);
      setToolTypes([]);
    };
  }, [mcpServerList, host]);

  //
  const { setMcpDebugHelper } = useConfigStore();
  useEffect(() => {
    if (mcpDebugHelper) {
      setMcpDebugHelper(mcpDebugHelper);
    }
    return () => {
      setMcpDebugHelper(undefined);
    };
  }, [mcpDebugHelper]);
};
