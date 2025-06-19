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

import { MessageItemProps } from '../../types';
import styles from './index.module.less';

export interface ErrorContentProps {
  errorMessage: MessageItemProps['errorMessage'];
  renderErrorMessage?: MessageItemProps['renderErrorMessage'];
}

const ErrorContent = (props: ErrorContentProps) => {
  const { errorMessage, renderErrorMessage } = props;

  const errorContent = renderErrorMessage ? (
    renderErrorMessage(errorMessage)
  ) : (
    <div className={styles.arkUiChatMessageItemErrorContent}>
      <span>{errorMessage}</span>
    </div>
  );

  return <div>{errorContent}</div>;
};

export default ErrorContent;
