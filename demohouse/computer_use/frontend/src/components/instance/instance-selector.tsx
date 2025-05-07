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

  const { sandboxList, ip } = useSnapshot(store);

  const handleInstanceChange = (value: string) => {
    if (value === "create-new") {
      onCreateNewInstance();
    } else {
      actions.setIp(value);
    }
  };

  return (
    <div className="flex items-center gap-[12px]">
      <Select
        className={`instance-selector width-[200px] ${
          sandboxList.length === 0 || !ip ? "empty" : ""
        }`}
        value={ip}
        onChange={handleInstanceChange}
        loading={loading}
        placeholder={loading ? "加载中..." : "选择实例..."}
        style={{ width: 200 }}
      >
        {sandboxList.map((sandbox) => (
          <Select.Option
            key={sandbox.SandboxId}
            value={sandbox.Eip || sandbox.PrimaryIp || sandbox.SandboxId}
            className="flex items-center gap-2"
          >
            <OsTypeLogo osType={sandbox.OsType} />
            {sandbox.Eip || sandbox.PrimaryIp} (
            {sandbox.SandboxId.substring(0, 8)})
          </Select.Option>
        ))}
        <Select.Option value="create-new" className="text-indigo-600">
          <IconArrowRight className="mr-1" />
          启动新实例
        </Select.Option>
      </Select>
      <Button
        type="primary"
        onClick={onCreateNewInstance}
        icon={<IconArrowRight />}
      >
        启动
      </Button>
    </div>
  );
};
