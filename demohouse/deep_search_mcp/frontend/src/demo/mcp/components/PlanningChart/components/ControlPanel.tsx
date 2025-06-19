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
 * 控制面板组件 - 使用 Context 版本
 * 通过 useFlowChart hook 获取状态和操作方法
 */
import type React from 'react';

import { Button } from '@arco-design/web-react';
import { IconMinus, IconPlus, IconRefresh } from '@arco-design/web-react/icon';
import { Panel } from '@xyflow/react';

import { useFlowChart } from '../contexts/FlowChartContext';

const ControlPanel: React.FC = () => {
  const { handleZoomIn, handleZoomOut, resetView, isInitialized, zoom } =
    useFlowChart();

  return (
    <Panel position="bottom-left">
      <div className="flex flex-col space-y-3">
        {/* 视图控制按钮 */}
        <div className="flex space-x-2">
          <Button
            className={'!bg-white'}
            iconOnly
            shape="circle"
            icon={<IconRefresh style={{ fontSize: 16, marginTop: 4 }} />}
            onClick={resetView}
            disabled={!isInitialized}
            title="重置视图"
          />
          <Button
            className="flex gap-2 items-center !bg-white !border-[#dde2e9] !px-2"
            shape="round"
          >
            <IconMinus
              className={zoom === 0.1 ? 'cursor-not-allowed' : 'cursor-pointer'}
              onClick={() => {
                if (zoom > 0.1) {
                  handleZoomOut();
                }
              }}
            />

            <div className="!ml-0 w-[30px] text-center text-[12px] font-normal leading-[22px] text-[#1A1815]">
              {Math.round(zoom * 100)}%
            </div>
            <IconPlus
              className={zoom === 2 ? 'cursor-not-allowed' : 'cursor-pointer'}
              onClick={() => {
                if (zoom < 2) {
                  handleZoomIn();
                }
              }}
            />
          </Button>
        </div>
      </div>
    </Panel>
  );
};

export default ControlPanel;
