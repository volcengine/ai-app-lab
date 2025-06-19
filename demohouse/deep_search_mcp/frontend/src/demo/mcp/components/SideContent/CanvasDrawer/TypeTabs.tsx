import { Radio } from '@arco-design/web-react';
import cx from 'classnames';

import { IconFollow } from '@/demo/mcp/assets/IconFollow';
import { useCanvasStore } from '@/demo/mcp/store/CanvasStore';

import { getBroadcastInfo } from '../../CanvasArea/components/PlayerBroadcast/source';
import styles from './index.module.less';

export const TypeTabs = () => {
  const data = useCanvasStore(state => state.data);
  const currentType = useCanvasStore(state => state.currentType);
  const setCurrentType = useCanvasStore(state => state.setCurrentType);
  const currentSessionId = useCanvasStore(state => state.currentSessionId);
  const currentIndex = useCanvasStore(state => state.currentIndex);
  const setCurrentIndex = useCanvasStore(state => state.setCurrentIndex);
  const types = Array.from(new Set(data[currentSessionId].map(item => item.type)));

  return (
    <div className="flex items-center gap-[8px] -my-4">
      <div
        onClick={() => setCurrentType('follow')}
        className={cx(styles.customRadioItem, currentType === 'follow' && styles.customRadioActive)}
      >
        <IconFollow />
        <span>实时跟随</span>
      </div>
      <div className={styles.scrollBar}>
        <Radio.Group
          value={currentType}
          className={styles.radioGroupWrapper}
          onChange={v => {
            const currentData = data[currentSessionId][currentIndex];
            if (v !== 'follow' && currentData?.type !== v) {
              const idx = data[currentSessionId].findIndex(item => item.type === v);
              setCurrentIndex(idx >= 0 ? idx : 0);
            }
            setCurrentType(v);
          }}
        >
          {types.map(type => (
            <Radio key={type} value={type}>
              {({ checked }) => (
                <div className={cx(styles.label, { [styles.labelChecked]: checked })}>
                  <img src={getBroadcastInfo(type).iconSrc} className={styles.radioImg} />
                  <span className="text-nowrap">{getBroadcastInfo(type).name || type}</span>
                </div>
              )}
            </Radio>
          ))}
        </Radio.Group>
      </div>
    </div>
  );
};
