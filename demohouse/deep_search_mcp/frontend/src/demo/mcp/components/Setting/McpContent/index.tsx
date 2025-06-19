import { Button, Popconfirm } from '@arco-design/web-react';
import { IconPlus, IconSettings } from '@arco-design/web-react/icon';
import { IconDelete, IconInfoCircleFill } from '@arco-design/web-react/icon';

import {
  useChatConfigStore,
  useToolTreeList,
} from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';
import { useMcpSelectModalStore } from '@/demo/mcp/store/ChatConfigStore/useMcpSelectModalStore';
import type { Tool } from '@/demo/mcp/types/tool';

import s from './index.module.less';

export const McpContent = () => {
  const {
    setModalVisible,
    setModalCurrentType,
    setModalCurrentSearchStr,
    setModalCurrentTool,
  } = useMcpSelectModalStore();
  const { enableToolList, setEnableToolList } = useChatConfigStore();

  const { enabledToolTreeList } = useToolTreeList();

  const handleItemClick = (tool: Tool) => {
    setModalCurrentSearchStr('');
    setModalCurrentType('全部');
    setModalCurrentTool(tool);
    setModalVisible(true);
  };

  const onCancelItem = (tool: Tool) => {
    setEnableToolList(enableToolList.filter(t => t.name !== tool.name));
  };

  return (
    <div className={s.c}>
      <div className={s.serviceList}>
        {enabledToolTreeList.map(item => (
          <div key={item.name} className={s.group}>
            <div className={s.groupName}>{item.name}</div>
            <div className={s.desc}>{item.description}</div>
            <div className={s.itemList}>
              {item.children.map(item => (
                <div
                  key={item.name}
                  className={s.item}
                  onClick={() => {
                    handleItemClick(item);
                  }}
                >
                  <div
                    className={'w-full flex gap-2 items-center justify-between'}
                  >
                    <div className={'flex gap-2'}>
                      <img src={item.icon} className={s.icon}></img>
                      <div className={s.name}>{item.name}</div>
                    </div>
                    <div className="flex justify-end gap-[8px] text-[#737A87]">
                      {!item.required && (
                        <Popconfirm
                          title="确定要取消添加吗？"
                          content="取消后可以在 MCP Servers 中继续添加"
                          icon={<IconInfoCircleFill />}
                          onOk={e => {
                            e.stopPropagation();
                            onCancelItem(item);
                          }}
                          onCancel={e => {
                            e.stopPropagation();
                          }}
                        >
                          <IconDelete
                            onClick={e => {
                              e.stopPropagation();
                            }}
                            className={s.delete}
                          />
                        </Popconfirm>
                      )}
                      <IconSettings />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={s.addBtnWrapper}>
        <Button
          type={'primary'}
          icon={<IconPlus />}
          onClick={() => {
            setModalVisible(true);
          }}
        >
          添加MCP服务
        </Button>
      </div>
    </div>
  );
};
