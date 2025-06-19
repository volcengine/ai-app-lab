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

import cx from 'classnames';

import type { Message } from '@/demo/mcp/types/message';

import { IconIconNewWindow } from '@/icon';
import Collapse from '../../../Collapse';
import { AnimatedSubtitle } from '../AnimatedSubtitle';
import s from './index.module.less';
export const ReferenceContent = ({ message }: { message: Message }) => (
  <div className="my-[15px]">
    <Collapse
      headerClassName="rounded-[6px] !w-fit bg-[#F6F8FA] px-2 py-1"
      title={
        <AnimatedSubtitle icon={null} isLoading={false} text={'来源引用'} />
      }
    >
      <div className="flex flex-col gap-[12px]">
        {message.references?.map((r, idx) => (
          <div
            className={cx(s.reference, r?.url && `cursor-pointer`)}
            key={idx}
            onClick={() => r?.url && window.open(r.url, '_blank')}
          >
            <div>
              {`${idx + 1}. `}
              {r?.doc_name || `${r?.title} | ${r?.site_name}`}
              <IconIconNewWindow className="ml-[4px] opacity-70" />
            </div>
          </div>
        ))}
      </div>
    </Collapse>
  </div>
);
