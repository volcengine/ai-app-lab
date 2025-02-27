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

import { Message } from '@/components/ChatWindowV2/context';
import { useToggleMessage, EToggleMessageDirection } from '@/components/ChatWindowV2/useToggleMessage';

import { ActionIcon } from '../ActionIcon';

interface Props {
  message: Message;
}

export const MessageBranchChecker = ({ message }: Props) => {
  const { indicator, enableLastMsgDirection, toggle } = useToggleMessage();

  return indicator.show ? (
    <>
      <ActionIcon
        tips={'上一条'}
        disabled={!enableLastMsgDirection.canPrev}
        onClick={() => {
          toggle(message.id, EToggleMessageDirection.Prev);
        }}
      >
        <IconLeft className="hover:bg-[##E2EAF9] rounded-[4px]" />
      </ActionIcon>
      <span className="text-[12px]">{`${indicator.current} / ${indicator.total}`}</span>
      <ActionIcon
        tips={'下一条'}
        disabled={!enableLastMsgDirection.canNext}
        onClick={() => {
          toggle(message.id, EToggleMessageDirection.Next);
        }}
      >
        <IconRight className="hover:bg-[##E2EAF9] rounded-[4px]" />
      </ActionIcon>
    </>
  ) : null;
};
