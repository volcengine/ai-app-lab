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
