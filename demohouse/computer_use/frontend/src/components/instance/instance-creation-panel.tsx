import { OSType } from "@/services/sandbox";
import { useState } from "react";
import store from "@/store";
import { FC } from "react";
import { useSnapshot } from "valtio";
import { OsTypeLogo } from "../os-type-logo";
import { Button } from "@arco-design/web-react";
import { IconArrowRight } from "@arco-design/web-react/icon";

export const InstanceCreationPanel: FC<{
  onCreateInstance: (osType: OSType) => void;
}> = ({ onCreateInstance }) => {
  const { creating } = useSnapshot(store);
  const [selectedOs, setSelectedOs] = useState<OSType>(OSType.LINUX);
  return (
    <div className="text-center w-full">
      <div className="flex flex-col gap-4">
        <div className="text-center mb-6">
          <p className="text-sm text-slate-600">
            选择您需要的操作系统类型并启动沙箱
          </p>
        </div>
        <div className="relative w-16 h-16 mb-5 mx-auto">
          <OsTypeLogo osType={selectedOs} size="large" />
        </div>
        <div className="flex gap-3 justify-center mb-5">
          {[OSType.LINUX, OSType.WINDOWS].map((os) => (
            <Button
              key={os}
              className="w-[100px]"
              type={selectedOs === os ? "primary" : "outline"}
              onClick={() => setSelectedOs(os)}
            >
              {os}
            </Button>
          ))}
        </div>
      </div>

      <Button
        type="primary"
        className="w-full mt-5"
        onClick={() => {
          onCreateInstance(selectedOs);
        }}
        disabled={creating}
      >
        <IconArrowRight className="mr-2" />
        {creating ? "启动中..." : "启动沙箱"}
      </Button>
    </div>
  );
};
