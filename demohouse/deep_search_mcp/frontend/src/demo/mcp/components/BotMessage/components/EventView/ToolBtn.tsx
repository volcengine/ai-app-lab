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
