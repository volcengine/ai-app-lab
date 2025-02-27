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

import { FC, useRef } from 'react';

import { useSize } from 'ahooks';

import { IconBotAvatar } from '@/images';

import styles from './index.module.less';

interface Props {
  id: number;
  content: string;
}

const UserMessage: FC<Props> = props => {
  const { content } = props;
  const userMessageRef = useRef<HTMLSpanElement>(null);

  const size = useSize(userMessageRef);
  const { width = 0 } = size || {};
  return (
    <div className="mb-[16px]">
      <div
        className={`relative mb-[12px] flex justify-center ${width < 700 ? 'items-end' : 'items-center'} ${
          width < 700 ? '' : 'flex-col'
        } relative  items-end mt-[5px] top-[2px] ${styles.hiddenScroll} `}
      >
        <IconBotAvatar className=" relative top-[6px] shrink-0" />
        <span
          ref={userMessageRef}
          className="bg-[color:#F0F4F7] break-all text-neutral-950 text-base font-medium leading-snug tracking-tight"
        >
          {content}
        </span>
      </div>
    </div>
  );
};

export default UserMessage;
