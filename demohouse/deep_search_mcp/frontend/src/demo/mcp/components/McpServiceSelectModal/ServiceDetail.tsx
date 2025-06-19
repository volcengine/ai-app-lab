import ReactJson from 'react-json-view';
import { useMemo } from 'react';

import { Popover, Switch } from '@arco-design/web-react';

import { useMcpSelectModalStore } from '@/demo/mcp/store/ChatConfigStore/useMcpSelectModalStore';
import { CopyBtn } from '@/demo/mcp/components/CopyBtn';
import { useChatConfigStore } from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';

import s from './index.module.less';

export const ServiceDetail = () => {
  const { modalCurrentTool } = useMcpSelectModalStore();
  const { enableToolList, setEnableToolList } = useChatConfigStore();

  const parsedJson = useMemo(() => {
    try {
      return JSON.parse(modalCurrentTool?.content || '{}');
    } catch (error) {
      return { error: 'Invalid JSON format' };
    }
  }, [modalCurrentTool?.content]);

  const onSwitchChange = (checked: boolean) => {
    if (!modalCurrentTool) {
      return;
    }
    if (checked) {
      setEnableToolList([...enableToolList, modalCurrentTool]);
    } else {
      setEnableToolList(enableToolList.filter(t => t.name !== modalCurrentTool.name));
    }
  };

  return (
    <div className={s.serviceDetail}>
      <div className={'flex flex-col h-full overflow-hidden'}>
        <div className={s.title}>
          <span>{modalCurrentTool?.name}</span>
          <Popover
            disabled={!modalCurrentTool?.required && !modalCurrentTool?.disabled}
            content={modalCurrentTool?.disabled ? '未配置无法开启' : '当前为官网预置 MCP 服务，不可关闭'}
          >
            <Switch
              className={s.switch}
              checked={Boolean(enableToolList.find(t => t.name === modalCurrentTool?.name))}
              checkedText="ON"
              uncheckedText="OFF"
              onChange={onSwitchChange}
              disabled={modalCurrentTool?.required || modalCurrentTool?.disabled}
            />
          </Popover>
        </div>
        <div className={s.desc}>{modalCurrentTool?.description}</div>
        <div className={s.json}>
          <div className={s.top}>
            <div>Config.json</div>
            <CopyBtn textToCopy={modalCurrentTool?.content || ''} />
          </div>
          <ReactJson
            src={parsedJson}
            theme="rjv-default"
            name={null}
            displayDataTypes={false}
            enableClipboard={true}
            collapsed={false}
            collapseStringsAfterLength={50}
            style={{
              backgroundColor: 'transparent',
              padding: '10px',
              borderRadius: '4px',
              overflow: 'auto',
            }}
          />
        </div>
      </div>
    </div>
  );
};
