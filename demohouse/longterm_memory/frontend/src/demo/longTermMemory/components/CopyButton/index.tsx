// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
