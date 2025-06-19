/**
 * 自定义小地图组件
 * 为不同类型的节点提供不同颜色显示
 */
import React from 'react';

import { MiniMap } from '@xyflow/react';

const CustomMiniMap: React.FC = () => (
  <MiniMap
    style={{
      width: 140,
      height: 100,
    }}
    nodeColor={node => {
      switch (node.type) {
        case 'operation':
          return '#dcfce7';
        case 'terminal':
          return '#dbeafe';
        default:
          return '#ffffff';
      }
    }}
    nodeStrokeWidth={3}
    zoomable
    pannable
  />
);

export default CustomMiniMap;
