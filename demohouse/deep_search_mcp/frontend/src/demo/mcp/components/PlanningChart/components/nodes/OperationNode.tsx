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
 * 操作节点组件 - 简化版
 * 用于显示具体的操作任务
 */
import type React from 'react';
import { memo } from 'react';

import { Typography } from '@arco-design/web-react';
import { IconLoading } from '@arco-design/web-react/icon';
import {
  Handle,
  type NodeProps,
  Position,
  type XYPosition,
} from '@xyflow/react';
import cx from 'classnames';

import { IconSuccessFill } from '@/icon';
import s from './index.module.less';

interface OperationNodeData {
  id: string;
  position: XYPosition;
  data: any;
  label: string;
  number?: number;
  isSelected?: boolean;
  isCompleted?: boolean;
  isLoading?: boolean;
  isHighlighted?: boolean;
  isDisabled?: boolean;
  agent?: string;
}
// t
const OperationNode: React.FC<NodeProps<OperationNodeData>> = ({
  data,
  isConnectable,
}) => (
  <div
    className={cx(s.node, s.operationNode, data.isSelected && s.nodeSelected)}
    style={{ pointerEvents: data.isDisabled ? 'none' : 'auto' }}
  >
    <Handle
      type="target"
      position={Position.Left}
      isConnectable={!data.isDisabled && isConnectable}
      className={'opacity-0'}
    />
    <div className={s.left}>{data.number || '·'}</div>
    <div className={s.right}>
      <div className={s.icon}>
        {data.isLoading && <IconLoading />}
        {data.isCompleted && !data.isLoading && (
          <IconSuccessFill style={{ color: '#009A29' }} />
        )}
      </div>
      <Typography.Ellipsis
        expandable={false}
        rows={1}
        showTooltip={true}
        className={'w-[170px]'}
      >
        {data.label}
      </Typography.Ellipsis>
    </div>

    {/* <Handle type="source" position={Position.Right} isConnectable={false} className={`w-3 h-3 ${handleColor}`} /> */}
  </div>
);

export default memo(OperationNode);
