import { FC } from "react";
import { Spinner } from "../spinner";
import store from "@/store";
import { useSnapshot } from "valtio";

export const Loading: FC = () => {
  const { sandbox } = useSnapshot(store);
  return (
    <div className="h-full flex-1 border-0 shadow-sm bg-white rounded-md flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <Spinner />

          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            正在启动您的远程沙箱
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
};
