import { Tabs } from '@arco-design/web-react';

import { IconClose } from '@/images/deepResearch';
import { McpContent } from '@/demo/mcp/components/Setting/McpContent';
import { RoundContent } from '@/demo/mcp/components/Setting/RoundContent';
import { TabsKey, useSettingDrawerStore } from '@/demo/mcp/store/ChatConfigStore/useSettingDrawerStore';

import s from './index.module.less';
const { TabPane } = Tabs;

export const Setting = () => {
  const { setDrawerVisible, drawerCurrentTab, setDrawerCurrentTab } = useSettingDrawerStore();

  const handleClose = () => {
    setDrawerVisible(false);
  };

  return (
    <div className={s.container}>
      <Tabs
        renderTabHeader={(props, DefaultTabHeader) => (
          <div className={s.tabHeader}>
            <DefaultTabHeader {...props} className={'w-full'} />
            <IconClose className={s.iconClose} onClick={handleClose} />
          </div>
        )}
        size={'large'}
        justify={true}
        className={s.tab}
        activeTab={drawerCurrentTab}
        onChange={v => setDrawerCurrentTab(v as TabsKey)}
      >
        <TabPane key={TabsKey.Round} title="应用设置">
          <RoundContent />
        </TabPane>
        <TabPane key={TabsKey.Mcp} title="MCP服务设置">
          <McpContent />
        </TabPane>
      </Tabs>
    </div>
  );
};
