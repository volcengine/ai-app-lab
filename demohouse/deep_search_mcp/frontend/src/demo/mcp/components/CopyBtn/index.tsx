import { useState } from 'react';

import { IconCheckCircleFill, IconCopy } from '@arco-design/web-react/icon';

import { ActionIcon } from '@/components/ActionIcon';

export const CopyBtn = ({
  textToCopy,
  className,
}: { textToCopy: string; className?: string }) => {
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
      <IconCheckCircleFill className={className} />
    </ActionIcon>
  ) : (
    <ActionIcon
      tips={'复制'}
      onClick={() => {
        handleCopy();
      }}
    >
      <IconCopy className={className} />
    </ActionIcon>
  );
};
