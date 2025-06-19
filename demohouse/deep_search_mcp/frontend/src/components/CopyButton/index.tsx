import { useState } from 'react';

import { IconCheckCircleFill, IconCopy } from '@arco-design/web-react/icon';

import { ActionIcon } from '../ActionIcon';

export const CopyButton = ({ textToCopy }: { textToCopy: string }) => {
  const [isCopySuccess, setIsCopySuccess] = useState(false);

  const handleCopy = () => {
    window.navigator.clipboard.writeText(textToCopy);
    setIsCopySuccess(true);
    setTimeout(() => {
      setIsCopySuccess(false);
    }, 3000);
  };

  return isCopySuccess ? (
    <ActionIcon tips={'已复制'}>
      <IconCheckCircleFill />
    </ActionIcon>
  ) : (
    <ActionIcon tips={'复制'} onClick={handleCopy}>
      <IconCopy />
    </ActionIcon>
  );
};
