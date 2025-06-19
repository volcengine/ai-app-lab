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

import { Modal, Typography } from '@arco-design/web-react';

import { TypeRadioGroup } from '@/demo/mcp/components/McpServiceSelectModal/TypeRadioGroup';
import { ServiceList } from '@/demo/mcp/components/McpServiceSelectModal/ServiceList';
import { ServiceDetail } from '@/demo/mcp/components/McpServiceSelectModal/ServiceDetail';
import { useMcpSelectModalStore } from '@/demo/mcp/store/ChatConfigStore/useMcpSelectModalStore';

import s from './index.module.less';
export const McpServiceSelectModal = () => {
  const { modalVisible, setModalVisible } = useMcpSelectModalStore();

  return (
    <Modal
      getPopupContainer={() => document.getElementById('mcp-page-container') || document.body}
      focusLock={false}
      onCancel={() => {
        setModalVisible(false);
      }}
      footer={null}
      visible={modalVisible}
      className={s.modal}
      title={
        <Typography.Title className={s.headerTitle} heading={5}>
          添加MCP服务
        </Typography.Title>
      }
    >
      <div className={s.cont}>
        <div className={s.type}>
          <TypeRadioGroup />
        </div>
        <div className={s.list}>
          <ServiceList />
        </div>
        <div className={s.detail}>
          <ServiceDetail />
        </div>
      </div>
    </Modal>
  );
};
