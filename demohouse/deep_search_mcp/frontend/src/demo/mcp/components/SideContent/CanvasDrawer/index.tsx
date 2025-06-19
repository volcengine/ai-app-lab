import { useCanvasStore } from '@/demo/mcp/store/CanvasStore';

import CommonPanel from '../../CommonPanel';
import CanvasArea from '../../CanvasArea';
import { TypeTabs } from './TypeTabs';

const CanvasDrawer = () => {
  const setShowCanvas = useCanvasStore(state => state.setShowCanvas);

  const onClose = () => {
    setShowCanvas(false);
  };

  return (
    <CommonPanel title={<TypeTabs />} onClose={onClose} style={{ width: '100%' }} simple={true}>
      <CanvasArea />
    </CommonPanel>
  );
};

export default CanvasDrawer;
