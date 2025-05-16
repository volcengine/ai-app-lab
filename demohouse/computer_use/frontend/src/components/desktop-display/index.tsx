"use client";

import { FC } from "react";
import { OSType } from "@/services/sandbox";
import store, { SandboxStatus } from "@/store";
import { useSnapshot } from "valtio";
import { WindowHeader } from "./desktop-header";
import { LinuxDesktop } from "./linux-desktop";
import { WindowsDesktop } from "./windows-desktop";
import { InstanceCreationPanel } from "../instance/instance-creation-panel";
import { Loading } from "./loading";

export const DesktopDisplay: FC<{
  onCreateInstance: (osType: OSType) => void;
}> = ({ onCreateInstance }) => {
  const { id, sandbox } = useSnapshot(store);

  if (!id) {
    // 如果没有选择沙箱，则显示创建新沙箱引导页
    if (store.canCreateSandbox) {
      return (
        <div className="h-full flex-1 border-0 shadow-sm bg-white rounded-md flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">启动新沙箱</h3>
          </div>

          <div className="flex-1 flex items-center justify-center p-4">
            <div className="mx-auto w-[300px]">
              <InstanceCreationPanel onCreateInstance={onCreateInstance} />
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="h-full flex-1 border-0 shadow-sm bg-white rounded-md">
          <div className="flex items-center justify-center p-4">
            <div className="mx-auto w-[300px]">
              <p className="text-sm text-slate-800">请选择沙箱</p>
            </div>
          </div>
        </div>
      );
    }
  }
  // 如果正在加载中，显示加载状态
  if (sandbox?.Status !== SandboxStatus.RUNNING) {
    return <Loading />;
  }

  // 如果选择了沙箱，则显示远程桌面
  return (
    <div className="h-full flex-1 w-full border-0 shadow-sm bg-white overflow-hidden rounded-lg flex flex-col">
      <WindowHeader />

      <div className="flex-1 w-full h-full bg-white relative ">
        {sandbox?.OsType === OSType.LINUX && <LinuxDesktop />}
        {sandbox?.OsType === OSType.WINDOWS && <WindowsDesktop />}
      </div>
    </div>
  );
};
