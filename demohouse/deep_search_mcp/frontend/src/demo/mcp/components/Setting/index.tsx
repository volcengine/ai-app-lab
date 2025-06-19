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
