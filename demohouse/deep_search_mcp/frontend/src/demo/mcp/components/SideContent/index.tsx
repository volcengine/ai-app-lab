import { useEffect } from 'react';

import cx from 'classnames';

import { Setting } from '@/demo/mcp/components/Setting';
import { useSettingDrawerStore } from '@/demo/mcp/store/ChatConfigStore/useSettingDrawerStore';
import { useAutoPEStore } from '@/demo/mcp/store/AutoPEStore';
import { McpServiceSelectModal } from '@/demo/mcp/components/McpServiceSelectModal';
import CanvasDrawer from '@/demo/mcp/components/SideContent/CanvasDrawer';
import AutoPEDrawer from '@/demo/mcp/components/SideContent/AutoPEDrawer';

import styles from './index.module.less';
import { useCanvasStore } from '../../store/CanvasStore';

export function SideContent() {
  const { drawerVisible: showMcpConfig, setDrawerVisible: setMcpConfigVisible } = useSettingDrawerStore();
  const { autopeDrawerVisible: showAutoPEConfig, setAutoPEDrawerVisible } = useAutoPEStore();
  const showCanvas = useCanvasStore(state => state.showCanvas);
  const setShowCanvas = useCanvasStore(state => state.setShowCanvas);

  // 都打开时，关闭另一个
  useEffect(() => {
    if (showMcpConfig) {
      showCanvas && setShowCanvas(false);
      showAutoPEConfig && setAutoPEDrawerVisible(false);
    }
  }, [showMcpConfig]);

  useEffect(() => {
    if (showCanvas) {
      showMcpConfig && setMcpConfigVisible(false);
      showAutoPEConfig && setAutoPEDrawerVisible(false);
    }
  }, [showCanvas]);

  useEffect(() => {
    if (showAutoPEConfig) {
      showCanvas && setShowCanvas(false);
      showMcpConfig && setMcpConfigVisible(false);
    }
  }, [showAutoPEConfig]);

  return (
    <div
      className={cx(styles.sideContent, {
        [styles.mcpConfigWidth]: showMcpConfig,
        [styles.autoPeConfigWidth]: showAutoPEConfig,
        [styles.canvasWidth]: showCanvas,
      })}
    >
      {showMcpConfig && <Setting />}
      {showCanvas && <CanvasDrawer />}
      {showAutoPEConfig && <AutoPEDrawer />}
      <McpServiceSelectModal />
    </div>
  );
}
