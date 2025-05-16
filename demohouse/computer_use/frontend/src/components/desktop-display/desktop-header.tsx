import { actions, store } from "@/store";
import { useSnapshot } from "valtio";
import { OsTypeLogo } from "../os-type-logo";
import { FC } from "react";

export const WindowHeader: FC = () => {
  const { sandbox } = useSnapshot(store);
  return (
    <div className="flex items-center justify-between bg-white px-3 py-2 border-b border-slate-200">
      <div className="flex items-center space-x-1.5">
        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
        <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
        <div
          className="w-3 h-3 bg-green-500 rounded-full cursor-pointer"
          onClick={() => actions.toggleMaximized()}
        ></div>
      </div>
      <div className="text-xs flex gap-2 font-medium text-slate-600">
        <OsTypeLogo osType={sandbox?.OsType} />
        远程桌面 - {sandbox?.PrimaryIp || sandbox?.Eip || sandbox?.SandboxId}
      </div>
      <div className="w-16"></div>
    </div>
  );
};
