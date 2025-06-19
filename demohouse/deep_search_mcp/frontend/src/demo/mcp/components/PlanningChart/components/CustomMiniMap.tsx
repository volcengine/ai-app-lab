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
