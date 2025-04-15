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

import { useState, useEffect, FC } from "react";
import { Select, Button } from "@arco-design/web-react";
import { IconArrowRight } from "@arco-design/web-react/icon";
import store, { actions } from "@/store";
import { useSnapshot } from "valtio";
import { OsTypeLogo } from "../os-type-logo";

interface InstanceSelectorProps {
  onCreateNewInstance: () => void;
}

export const InstanceSelector: FC<InstanceSelectorProps> = ({
  onCreateNewInstance,
}) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSandboxList() {
      setLoading(true);
      await actions.fetchSandboxList();
      setLoading(false);
    }
    fetchSandboxList();
  }, []);

  const { sandboxList, id, canCreateSandbox } = useSnapshot(store);

  const handleInstanceChange = (value: string) => {
    if (value === "create-new") {
      onCreateNewInstance();
    } else {
      actions.setId(value);
    }
  };

  return (
    <div className="flex items-center w-[297px] gap-[12px]">
      <Select
        className={`instance-selector flex-1 ${
          sandboxList.length === 0 || !id ? "empty" : ""
        }`}
        value={id}
        onChange={handleInstanceChange}
        loading={loading}
        placeholder={loading ? "加载中..." : "选择沙箱..."}
        style={{ width: 200 }}
      >
        {sandboxList.map((sandbox) => (
          <Select.Option
            key={sandbox.SandboxId}
            value={sandbox.SandboxId}
            className="flex items-center gap-2"
          >
            <OsTypeLogo osType={sandbox.OsType} />
            {sandbox.Eip || sandbox.PrimaryIp} (
            {sandbox.SandboxId.substring(0, 8)})
          </Select.Option>
        ))}
        {canCreateSandbox && (
          <Select.Option value="create-new" className="text-indigo-600">
            <IconArrowRight className="mr-1" />
            启动新沙箱
          </Select.Option>
        )}
      </Select>
      {canCreateSandbox && (
        <Button
          type="primary"
          onClick={onCreateNewInstance}
          icon={<IconArrowRight />}
        >
          启动
        </Button>
      )}
    </div>
  );
};
