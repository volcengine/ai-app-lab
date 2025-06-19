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
 * 终端节点组件
 * 用于显示流程的开始和结束节点
 */
import React, { memo } from 'react';

import cx from 'classnames';
import { Handle, Position, NodeProps, XYPosition } from '@xyflow/react';
import { Typography } from '@arco-design/web-react';

import s from './index.module.less';

interface TerminalNodeData {
  id: string;
  position: XYPosition;
  data: any;
  label: string;
  type: 'start' | 'end';
  isSelected?: boolean;
}

const TerminalNode: React.FC<NodeProps<TerminalNodeData>> = ({ data, isConnectable }) => (
  <div className={cx(s.node, s.terminalNode, data.isSelected && s.nodeSelected)}>
    <div className={s.cont}>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className={`opacity-0`} />
      <Typography.Ellipsis expandable={false} rows={1} showTooltip={true} className={'w-[200px]'}>
        {data.label}
      </Typography.Ellipsis>
    </div>
  </div>
);

export default memo(TerminalNode);
