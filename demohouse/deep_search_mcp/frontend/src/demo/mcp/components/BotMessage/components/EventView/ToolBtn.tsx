import { useContext } from 'react';

import cx from 'classnames';

import ToolIcon from '@/demo/mcp/assets/tool.png';
import { useCanvasStore } from '@/demo/mcp/store/CanvasStore';
import { BotMessageContext } from '@/demo/mcp/store/BotMessageContext/context';

import { default as LoadingDot } from './Dot';
import s from './index.module.less';

const Dot = ({ status }: { status: 'success' | 'error' }) => <div className={cx(s.dot, s[status])} />;

interface Props {
  id: string;
  type: string;
  loading: boolean;
  success?: boolean;
  functionName?: string;
}

export const ToolBtn = ({ id, type, functionName, loading, success }: Props) => {
  const { sessionId } = useContext(BotMessageContext);
  const jumpIndexById = useCanvasStore(state => state.jumpIndexById);

  return (
    <div
      className={cx(s.btn, { [s.colorfulBorder]: loading })}
      onClick={() => {
        jumpIndexById(sessionId, id);
      }}
    >
      <img src={ToolIcon} className={s.icon} />
      <div className={s.text}>正在执行</div>
      <div className={s.text}>{`${type}${functionName ? `-${functionName}` : ''}`}</div>
      <div className="shrink-0">
        {loading && <LoadingDot loading={loading} />}
        {!loading && <Dot status={success ? 'success' : 'error'} />}
      </div>
    </div>
  );
};
