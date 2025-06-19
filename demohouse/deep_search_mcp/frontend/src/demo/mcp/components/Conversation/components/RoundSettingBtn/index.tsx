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
