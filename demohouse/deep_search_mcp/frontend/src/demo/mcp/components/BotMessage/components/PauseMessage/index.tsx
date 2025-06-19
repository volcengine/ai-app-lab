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

import React, { ReactNode } from 'react';

import { Message } from '@/demo/mcp/types/message';

interface Props {
  message: Message;
  footer: ReactNode;
}

const PauseMessage = (props: Props) => {
  const { message, footer } = props;
  const { content } = message;

  return (
    <div className={`mb-[20px] bg-white rounded-lg border p-[16px]`}>
      <div>
        <div className="flex gap-2">
          <span className="break-all">{content}</span>
        </div>
        {/* 回答操作Bar */}
        {footer}
      </div>
    </div>
  );
};

export default PauseMessage;
