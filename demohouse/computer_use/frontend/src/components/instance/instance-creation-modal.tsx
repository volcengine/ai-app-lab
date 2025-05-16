"use client";

import { OSType } from "@/services/sandbox";
import { Modal } from "@arco-design/web-react";
import { FC } from "react";
import { InstanceCreationPanel } from "./instance-creation-panel";

interface CreateInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateInstance: (osType: OSType) => void;
}

export const CreateInstanceModal: FC<CreateInstanceModalProps> = ({
  isOpen,
  onClose,
  onCreateInstance,
}) => {
  if (!isOpen) return null;

  const handleCreateInstance = async (osType: OSType) => {
    try {
      await onCreateInstance(osType);
      onClose();
    } catch (error) {
      alert("创建沙箱失败");
      console.error("创建沙箱失败", error);
    }
  };

  return (
    <Modal
      style={{
        width: "450px",
      }}
      visible={isOpen}
      title="启动新沙箱"
      onCancel={onClose}
      footer={null}
    >
      <InstanceCreationPanel onCreateInstance={handleCreateInstance} />
    </Modal>
  );
};
