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

import { CSSProperties, ReactNode } from 'react';

export interface Editable {
  onConfirm?: (value: string) => void;
  onCancel?: () => void;
}

export interface MessageItemProps {
  message: string; // 消息数据
  avatar?: ReactNode; // 角色头像
  editable?: Editable;
  errorMessage?: string;
  isAnimate?: boolean; // 使用打字机动画效果
  className?: string;
  style?: CSSProperties;
  renderMessage?: (content: any) => ReactNode; // 消息自定义渲染
  renderAnimateMessage?: (content: any) => ReactNode; // 打字机动画效果自定义渲染
  renderErrorMessage?: (content: any) => ReactNode;
  messageExtra?: ReactNode; // 消息额外信息
  messageClassName?: string;
}
