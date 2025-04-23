"use client";

import { FC } from "react";
import { OSType } from "@/services/sandbox";
import store, { SandboxStatus } from "@/store";
import { useSnapshot } from "valtio";
import { useVncUrl } from "@/hooks/use-vnc-url";
import { WindowHeader } from "./desktop-header";
import { LinuxDesktop } from "./linux-desktop";
import { WindowsDesktop } from "./windows-desktop";
import { InstanceCreationPanel } from "../instance/instance-creation-panel";
import { Spinner } from "../spinner";
export const DesktopDisplay: FC<{
  onCreateInstance: (osType: OSType) => void;
}> = ({ onCreateInstance }) => {
  const { ip, sandbox } = useSnapshot(store);

  const { vncUrl: iframeUrl, password, wsUrl } = useVncUrl(sandbox?.SandboxId);

  // 如果没有选择实例，则显示创建新实例引导页
  if (!ip) {
    return (
      <div className="h-full flex-1 border-0 shadow-sm bg-white rounded-md flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">启动新实例</h3>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="mx-auto w-[300px]">
            <InstanceCreationPanel onCreateInstance={onCreateInstance} />
          </div>
        </div>
      </div>
    );
  }

  // 如果正在加载中，显示加载状态
  if (sandbox?.Status !== SandboxStatus.RUNNING) {
    return (
      <div className="h-full flex-1 border-0 shadow-sm bg-white rounded-md flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">实例启动中</h3>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Spinner />

            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              正在启动您的远程实例
            </h2>
            <p className="text-sm text-slate-600 mb-3">
              这可能需要1-2分钟的时间，请耐心等待
            </p>

            <div className="w-64 mx-auto bg-slate-200 rounded-full h-2.5 mb-4">
              <div
                className="h-2.5 rounded-full animate-[loading_2s_ease-in-out_infinite]"
                style={{
                  background: "rgb(var(--primary-6))",
                }}
              ></div>
            </div>

            <p className="text-xs text-slate-500">
              正在配置
              {sandbox?.OsType}
              环境...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 如果选择了实例，则显示远程桌面
  return (
    <div className="h-full flex-1 w-full border-0 shadow-sm bg-white overflow-hidden rounded-lg flex flex-col">
      <WindowHeader />

      <div className="flex-1 w-full h-full bg-white relative ">
        {sandbox?.OsType === OSType.LINUX && iframeUrl && (
          <LinuxDesktop iframeUrl={iframeUrl} />
        )}

        {sandbox?.OsType === OSType.WINDOWS && password && wsUrl && (
          <WindowsDesktop
            instanceId={sandbox?.SandboxId}
            ip={ip}
            password={password}
            url={wsUrl}
          />
        )}
      </div>
    </div>
  );
};
