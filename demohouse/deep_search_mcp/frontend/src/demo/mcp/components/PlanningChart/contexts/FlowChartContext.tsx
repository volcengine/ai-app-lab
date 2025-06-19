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

/**
 * FlowChart Context
 * 统一管理流程图的所有状态，包括节点、边、模拟进度等
 */
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

import {
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from '@xyflow/react';

import { useChatInstance } from '@/demo/mcp/hooks/useInstance';

// 数据接口定义
interface PlanningItem {
  id: string;
  description: string;
  assign_agent: string;
  process_records: any[];
  history: any[];
  result_summary: string;
  done: boolean;
}

interface PlanningEvent {
  type: 'planning';
  action: 'made' | 'update';
  planning: {
    root_task: string;
    items: PlanningItem[];
  };
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    completion_tokens_details: {
      reasoning_tokens: number;
    };
  };
  currentExecutingStep?: string;
  highlightedStep?: string;
}

// Context 类型定义
interface FlowChartContextType {
  // 状态
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isInitialized: boolean;
  reactFlowInstance: ReactFlowInstance | null;
  zoom: number;
  currentPlanningData: PlanningEvent['planning'] | null;
  currentExecutingStep: string | null;
  highlightedStep: string | null;
  isCompleted: boolean;

  // 操作方法
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void;

  // 控制方法
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  resetView: () => void;

  // 外部控制
  setExternalHighlightedStep: (step: string | null) => void;
  setExternalCurrentExecutingStep: (step: string | null) => void;
}

const FlowChartContext = createContext<FlowChartContextType | undefined>(undefined);

// Provider 组件
interface FlowChartProviderProps {
  children: ReactNode;
  highlightedStep?: string;
  currentExecutingStep?: string;
}

// 工具函数
const generateInitialNodes = (rootTask: string, itemsCount: number): Node[] => {
  // 计算子节点们的垂直中心位置
  const firstChildY = 50;
  const childSpacing = 100;
  const lastChildY = firstChildY + (itemsCount - 1) * childSpacing;
  const centerY = itemsCount > 0 ? (firstChildY + lastChildY) / 2 : 200;

  return [
    {
      id: 'root',
      type: 'terminal',
      position: { x: 50, y: centerY },
      data: {
        label: rootTask,
        type: 'start',
      },
    },
  ];
};

const generateTaskNodes = (
  items: PlanningItem[],
  highlightedStep?: string,
  currentExecutingStep?: string,
  // currentSimulationStep?: number, // Removed
): Node[] =>
  items.map((item, index) => {
    const stepNumber = index + 1;
    // const isCurrentOrPast = currentSimulationStep !== undefined ? stepNumber <= currentSimulationStep + 1 : true; // Removed
    // const isDisabled = !isCurrentOrPast && !item.done; // Simplified isDisabled logic
    const isDisabled = !item.done && item.id !== currentExecutingStep; // A step is disabled if not done and not currently executing

    return {
      id: item.id,
      type: 'operation',
      position: { x: 400, y: 50 + index * 100 },
      data: {
        label: item.description,
        number: stepNumber,
        isCompleted: item.done || false,
        isLoading: currentExecutingStep === item.id,
        isHighlighted: highlightedStep === item.id,
        isDisabled,
        agent: item.assign_agent,
      },
    };
  });

const generateEdges = (items: PlanningItem[]): Edge[] => {
  const allEdges = items.map((item, index) => {
    // 判断是否执行到：任务已完成
    // const isExecuted = item.done || (simulationStep !== undefined && index <= simulationStep); // Simplified isExecuted
    const isExecuted = item.done;

    return {
      id: `e-root-${item.id}`,
      source: 'root',
      target: item.id,
      type: 'smoothstep',
      style: {
        strokeWidth: 2,
        stroke: isExecuted ? '#8b5cf6' : '#9ca3af',
        zIndex: isExecuted ? 10 : 1,
      },
      sourceHandle: null,
      targetHandle: null,
      isExecuted,
    };
  });

  // 关键：重新排序，确保已执行的边（紫色）排在最后，这样会渲染在最上层
  return allEdges
    .sort((a, b) => {
      if (a.isExecuted === b.isExecuted) {
        return 0;
      }
      return a.isExecuted ? 1 : -1; // 已执行的排在后面
    })
    .map(({ isExecuted, ...edge }) => edge);
};

export const FlowChartProvider: React.FC<FlowChartProviderProps> = ({
  children,
  highlightedStep: externalHighlightedStep,
  currentExecutingStep: externalCurrentExecutingStep,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  // const [simulationStep, setSimulationStep] = useState<number>(0); // Removed
  const [currentPlanningData, setCurrentPlanningData] = useState<PlanningEvent['planning'] | null>(null);
  const [currentExecutingStep, setCurrentExecutingStep] = useState<string | null>(null);
  const [highlightedStep, setHighlightedStep] = useState<string | null>(null);

  // 监听外部传入的参数变化
  useEffect(() => {
    if (externalHighlightedStep !== undefined) {
      setHighlightedStep(externalHighlightedStep);
    }
  }, [externalHighlightedStep]);

  useEffect(() => {
    if (externalCurrentExecutingStep !== undefined) {
      setCurrentExecutingStep(externalCurrentExecutingStep);
    }
  }, [externalCurrentExecutingStep]);

  // 当高亮或执行状态改变时，更新节点 (and currentPlanningData changes)
  useEffect(() => {
    if (currentPlanningData) {
      const rootNodes = generateInitialNodes(currentPlanningData.root_task, currentPlanningData.items.length);
      const taskNodes = generateTaskNodes(
        currentPlanningData.items,
        highlightedStep || undefined,
        currentExecutingStep || undefined,
      );
      const updatedNodes = [...rootNodes, ...taskNodes];
      setNodes(updatedNodes);

      const updatedEdges = generateEdges(currentPlanningData.items);
      setEdges(updatedEdges);
    }
  }, [highlightedStep, currentExecutingStep, currentPlanningData, setNodes, setEdges]);

  // Handle planning events
  const { chatList } = useChatInstance();
  useEffect(() => {
    const lastPlanningEvent = chatList.reduce<PlanningEvent | null>((last, message) => {
      if (message.events) {
        const planningEvents = message.events.filter(event => event.type === 'planning');
        console.log('##planningEvents', planningEvents, message);

        if (planningEvents.length > 0) {
          // 确保获取的是 result 内部的 PlanningEvent 数据
          const lastWrapperEvent = planningEvents[planningEvents.length - 1];
          if (lastWrapperEvent && lastWrapperEvent.result) {
            return lastWrapperEvent.result as PlanningEvent;
          }
        }
      }
      return last;
    }, null);

    if (lastPlanningEvent) {
      // 存在就设置为已经初始化
      setIsInitialized(true);
      setCurrentPlanningData(lastPlanningEvent.planning);

      if (lastPlanningEvent.highlightedStep !== undefined) {
        setHighlightedStep(lastPlanningEvent.highlightedStep);
      }
      if (lastPlanningEvent.currentExecutingStep !== undefined) {
        setCurrentExecutingStep(lastPlanningEvent.currentExecutingStep);
      }

      // if (!isInitialized && lastPlanningEvent.action === 'made') {
      // setIsInitialized(true);
      // }
    }
  }, [chatList, isInitialized]);

  // 操作方法
  const onConnect: OnConnect = useCallback((params: Connection) => setEdges(eds => addEdge(params, eds)), [setEdges]);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (!isInitialized || node.data?.isDisabled) {
        return;
      }
      setSelectedNodeId(node.id);
      setNodes(nds =>
        nds.map(n => ({
          ...n,
          data: {
            ...n.data,
            isSelected: n.id === node.id,
          },
        })),
      );
    },
    [isInitialized, setNodes],
  );

  const handleZoomIn = useCallback(() => {
    if (!isInitialized || !reactFlowInstance) {
      return;
    }
    const newZoom = Math.min(zoom + 0.1, 2);
    reactFlowInstance.zoomTo(newZoom);
    setZoom(newZoom);
  }, [reactFlowInstance, zoom, isInitialized]);

  const handleZoomOut = useCallback(() => {
    if (!isInitialized || !reactFlowInstance) {
      return;
    }
    const newZoom = Math.max(zoom - 0.1, 0.5);
    reactFlowInstance.zoomTo(newZoom);
    setZoom(newZoom);
  }, [reactFlowInstance, zoom, isInitialized]);

  const resetView = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2, maxZoom: zoom });
    }
  }, [reactFlowInstance, zoom]);

  const isCompleted = currentPlanningData ? currentPlanningData.items.every(item => item.done) : false;

  const contextValue: FlowChartContextType = {
    // 状态
    nodes,
    edges,
    selectedNodeId,
    isInitialized,
    reactFlowInstance,
    zoom,
    currentPlanningData,
    currentExecutingStep,
    highlightedStep,
    isCompleted,

    // 操作方法
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    setReactFlowInstance,

    // 控制方法
    handleZoomIn,
    handleZoomOut,
    resetView,

    // 外部控制
    setExternalHighlightedStep: setHighlightedStep,
    setExternalCurrentExecutingStep: setCurrentExecutingStep,
  };

  return <FlowChartContext.Provider value={contextValue}>{children}</FlowChartContext.Provider>;
};

// 自定义 Hook
export const useFlowChart = (): FlowChartContextType => {
  const context = useContext(FlowChartContext);
  if (context === undefined) {
    throw new Error('useFlowChart must be used within a FlowChartProvider');
  }
  return context;
};

export { FlowChartContext };
