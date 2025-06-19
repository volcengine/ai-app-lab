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

import { IconLeft, IconRight } from '@arco-design/web-react/icon';

import { ActionIcon } from '../../ActionIcon';

interface Props {
  current: number;
  total: number;
  updateCurrent?: (val: number) => void;
}

export const MessageBranchChecker = ({
  current,
  total,
  updateCurrent,
}: Props) =>
  total > 1 ? (
    <div className="flex items-center">
      <ActionIcon
        tips={'上一条'}
        disabled={current === 0}
        onClick={() => {
          updateCurrent?.(current - 1);
        }}
      >
        <IconLeft className="hover:bg-[##E2EAF9] rounded-[4px]" />
      </ActionIcon>
      <div className="text-[12px]">{`${current + 1} / ${total}`}</div>
      <ActionIcon
        tips={'下一条'}
        disabled={current === total - 1}
        onClick={() => {
          updateCurrent?.(current + 1);
        }}
      >
        <IconRight className="hover:bg-[##E2EAF9] rounded-[4px]" />
      </ActionIcon>
    </div>
  ) : null;
