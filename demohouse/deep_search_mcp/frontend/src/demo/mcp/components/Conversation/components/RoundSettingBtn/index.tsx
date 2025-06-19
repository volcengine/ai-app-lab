import cx from 'classnames';

import { ReactComponent as IconCalledMCP } from '@/images/deepResearch/icon_called_mcp.svg';
import { TabsKey, useSettingDrawerStore } from '@/demo/mcp/store/ChatConfigStore/useSettingDrawerStore';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';

import { ReactComponent as IconSetting } from '../../../../assets/iconSetting.svg';
import s from './index.module.less';

export function RoundSettingBtn() {
  const { drawerCurrentTab, setDrawerCurrentTab, setDrawerVisible, drawerVisible } = useSettingDrawerStore();
  const { isChatting } = useChatInstance();

  return (
    <div className="flex gap-2">
      <div
        className={cx(s.btn, isChatting && s.disabled)}
        onClick={() => {
          if (isChatting) {
            return;
          }
          if (drawerVisible && drawerCurrentTab === TabsKey.Mcp) {
            setDrawerVisible(false);
          } else {
            setDrawerVisible(true);
            setDrawerCurrentTab(TabsKey.Mcp);
          }
        }}
      >
        <IconCalledMCP />
        <div>MCP服务设置</div>
      </div>
      <div
        className={cx(s.btn, s.btnSquare, isChatting && s.disabled)}
        onClick={() => {
          if (isChatting) {
            return;
          }
          if (drawerVisible && drawerCurrentTab === TabsKey.Round) {
            setDrawerVisible(false);
          } else {
            setDrawerVisible(true);
            setDrawerCurrentTab(TabsKey.Round);
          }
        }}
      >
        <IconSetting />
      </div>
    </div>
  );
}
