import { useCallback } from 'react';

import { Message } from '@arco-design/web-react';
import { IconCopy } from '@arco-design/web-react/icon';

const DebugInfo = ({ text }: { text: string }) => {
  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    Message.success('复制成功');
  }, [text]);

  return (
    <div className="text-gray text-xs mt-2 tracking-tight">
      <div className="py-1  text-gray-500 flex items-center gap-1">
        <IconCopy className={'cursor-pointer'} onClick={copyToClipboard} />{' '}
        request id:&nbsp;{text}
      </div>
    </div>
  );
};

export default DebugInfo;
