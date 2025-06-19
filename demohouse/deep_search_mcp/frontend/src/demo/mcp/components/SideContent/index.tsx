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

import { useEffect } from 'react';

import cx from 'classnames';

import { Setting } from '@/demo/mcp/components/Setting';
import { useSettingDrawerStore } from '@/demo/mcp/store/ChatConfigStore/useSettingDrawerStore';
import { McpServiceSelectModal } from '@/demo/mcp/components/McpServiceSelectModal';
import CanvasDrawer from '@/demo/mcp/components/SideContent/CanvasDrawer';

import styles from './index.module.less';
import { useCanvasStore } from '../../store/CanvasStore';

export function SideContent() {
  const { drawerVisible: showMcpConfig, setDrawerVisible: setMcpConfigVisible } = useSettingDrawerStore();
  const showCanvas = useCanvasStore(state => state.showCanvas);
  const setShowCanvas = useCanvasStore(state => state.setShowCanvas);

  // 都打开时，关闭另一个
  useEffect(() => {
    if (showMcpConfig) {
      showCanvas && setShowCanvas(false);
    }
  }, [showMcpConfig]);

  useEffect(() => {
    if (showCanvas) {
      showMcpConfig && setMcpConfigVisible(false);
    }
  }, [showCanvas]);

  return (
    <div
      className={cx(styles.sideContent, {
        [styles.mcpConfigWidth]: showMcpConfig,
        [styles.canvasWidth]: showCanvas,
      })}
    >
      {showMcpConfig && <Setting />}
      {showCanvas && <CanvasDrawer />}
      <McpServiceSelectModal />
    </div>
  );
}
