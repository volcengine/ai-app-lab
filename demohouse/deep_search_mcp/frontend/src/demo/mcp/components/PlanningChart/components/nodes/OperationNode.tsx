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
