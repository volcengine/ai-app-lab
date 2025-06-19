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

import { Input, Radio } from '@arco-design/web-react';
import cx from 'classnames';

import { useMcpSelectModalStore } from '@/demo/mcp/store/ChatConfigStore/useMcpSelectModalStore';
import { useChatConfigStore } from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';

import s from './index.module.less';

export const TypeRadioGroup = () => {
  const { modalCurrentType, setModalCurrentType, modalCurrentSearchStr, setModalCurrentSearchStr } =
    useMcpSelectModalStore();
  const { toolTypes } = useChatConfigStore();

  return (
    <div className={s.typeRadioList}>
      <Input
        placeholder={'请输入'}
        autoFocus={false}
        value={modalCurrentSearchStr}
        onChange={setModalCurrentSearchStr}
        className={cx(s.input, 'mb-5')}
      />
      <Radio.Group onChange={v => setModalCurrentType(v)} value={modalCurrentType} className={'flex flex-col gap-1'}>
        {['全部', ...toolTypes.map(t => t.name)].map(item => (
          <Radio key={item} value={item} className={'w-full'}>
            {({ checked }) => (
              <div key={item} className={cx(s.item, checked && s.itemActive)}>
                {item}
              </div>
            )}
          </Radio>
        ))}
      </Radio.Group>
    </div>
  );
};
