/**
 * FlowChart 主组件 - 使用 Context 版本
 * 简化了状态管理，所有状态都通过 Context 管理
 */
import React, { useMemo, useRef } from 'react';

import { ReactFlow, ReactFlowProvider, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import OperationNode from './components/nodes/OperationNode';
import TerminalNode from './components/nodes/TerminalNode';
import ControlPanel from './components/ControlPanel';
import CustomMiniMap from './components/CustomMiniMap';
import { FlowChartProvider, useFlowChart } from './contexts/FlowChartContext';
import { CloseButton } from './components/CloseButton';

interface FlowChartProps {
  highlightedStep?: string;
  currentExecutingStep?: string;
}

const FlowChartInner: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick, setReactFlowInstance } = useFlowChart();
  const nodeTypes = useMemo(
    () => ({
      operation: OperationNode,
      terminal: TerminalNode,
    }),
    [],
  );
  return (
    <div className="h-full w-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        // @ts-expect-error
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        defaultViewport={{
          x: 0,
          y: 0,
          zoom: 1,
        }}
        // fitView
        attributionPosition="top-left"
        onInit={setReactFlowInstance}
        defaultEdgeOptions={{
          type: 'step',
          style: { strokeWidth: 2, stroke: '#5252FF' },
        }}
      >
        <CustomMiniMap />
        <Background color="#aaa" gap={16} />
        <ControlPanel />
        <div className="absolute top-[10px] right-[10px] z-10">
          <CloseButton />
        </div>
      </ReactFlow>
    </div>
  );
};

const PlanningChart: React.FC<FlowChartProps> = ({ highlightedStep, currentExecutingStep }) => (
  <FlowChartProvider highlightedStep={highlightedStep} currentExecutingStep={currentExecutingStep}>
    <FlowChartInner />
  </FlowChartProvider>
);

export default function PlanningChartWithProvider({ highlightedStep, currentExecutingStep }: FlowChartProps = {}) {
  return (
    <ReactFlowProvider>
      <PlanningChart highlightedStep={highlightedStep} currentExecutingStep={currentExecutingStep} />
    </ReactFlowProvider>
  );
}
