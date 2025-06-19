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

import { IconTerminal } from '@/icon';
import CodePreview from '../../../CodePreview';
import styles from './index.module.less';

interface Props {
  code: string;
  stdout: string;
}

const PythonBox = (props: Props) => {
  const { code, stdout } = props;

  return (
    <div className="w-full h-full overflow-hidden flex flex-col rounded-lg p-[12px]">
      <CodePreview code={code} language={'python'} />
      <div className="bg-[#fff] pl-[12px] pt-[8px] border-t border-[#EAEDF1] max-h-[150px] flex flex-col gap-[12px]">
        <div className={styles.terminalTitle}>
          <IconTerminal className="mr-[4px]" />
          Terminal
        </div>
        <div className={styles.stout}>
          <span className="text-[green] mr-[4px]">$</span>
          <span>{stdout}</span>
        </div>
      </div>
    </div>
  );
};

export default PythonBox;
