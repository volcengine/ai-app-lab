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
