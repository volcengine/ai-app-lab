import { IconTerminal } from '@/icon';
import CodePreview from '../../../CodePreview';
import styles from './index.module.less';

interface Props {
  code: string;
  stdout: string;
}

const PythonBox = (props: Props) => {
  const { code, stdout } = props;

  return (
    <div className="w-full h-full overflow-hidden flex flex-col rounded-lg p-[12px]">
      <CodePreview code={code} language={'python'} />
      <div className="bg-[#fff] pl-[12px] pt-[8px] border-t border-[#EAEDF1] max-h-[150px] flex flex-col gap-[12px]">
        <div className={styles.terminalTitle}>
          <IconTerminal className="mr-[4px]" />
          Terminal
        </div>
        <div className={styles.stout}>
          <span className="text-[green] mr-[4px]">$</span>
          <span>{stdout}</span>
        </div>
      </div>
    </div>
  );
};

export default PythonBox;
