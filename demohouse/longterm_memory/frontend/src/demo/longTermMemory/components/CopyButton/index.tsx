import { useState } from 'react';



import { ActionIcon } from '../ActionIcon';
import {IconCheckCircleFill, IconCopy} from "@arco-design/web-react/icon";

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
      <IconCheckCircleFill className={'w-4 h-4 text-[#42464E]'} />
    </ActionIcon>
  ) : (
    <ActionIcon tips={'复制'} onClick={handleCopy}>
      <IconCopy className={'w-4 h-4 text-[#42464E]'} />
    </ActionIcon>
  );
};
