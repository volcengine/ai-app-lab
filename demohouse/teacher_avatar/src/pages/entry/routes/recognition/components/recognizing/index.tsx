import ScanLine from '../scanLine';
import { Stars } from '../star';
import styles from './index.module.less';

const Recognizing = () => (
  <div className={styles.mask}>
    <Stars />
    <ScanLine />
  </div>
);

export default Recognizing;
