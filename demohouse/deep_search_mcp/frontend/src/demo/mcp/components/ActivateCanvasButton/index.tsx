import React from 'react';

import { Button } from '@arco-design/web-react';
import { IconFolder } from '@arco-design/web-react/icon';

import { useCanvasStore } from '../../store/CanvasStore';
import s from './index.module.less';

const ActivateCanvasButton = () => {
  const currentSessionId = useCanvasStore(state => state.currentSessionId);
  const showCanvas = useCanvasStore(state => state.showCanvas);
  const setShowCanvas = useCanvasStore(state => state.setShowCanvas);

  return (
    <Button
      className={s.btn}
      disabled={!currentSessionId}
      onClick={() => {
        setShowCanvas(!showCanvas);
      }}
      iconOnly={true}
      icon={<IconFolder />}
    />
  );
};

export default ActivateCanvasButton;
