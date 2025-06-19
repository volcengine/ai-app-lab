import { useAutoPEStore } from '@/demo/mcp/store/AutoPEStore';

import CommonPanel from '../../CommonPanel';
import AutoPEPanel from '../../AutoPEPanel';

const AutoPEDrawer = () => {
  const setAutoPEDrawerVisible = useAutoPEStore(state => state.setAutoPEDrawerVisible);

  const onClose = () => {
    setAutoPEDrawerVisible(false);
  };

  return (
    <CommonPanel title="系统 Prompt 个性化优化" onClose={onClose} style={{ width: '100%' }}>
      <AutoPEPanel />
    </CommonPanel>
  );
};

export default AutoPEDrawer;
