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
