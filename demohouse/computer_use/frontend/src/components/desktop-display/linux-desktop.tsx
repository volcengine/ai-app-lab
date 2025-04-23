import { useVncUrl } from "@/hooks/use-vnc-url";
import store from "@/store";
import { FC } from "react";
import { useSnapshot } from "valtio";
import { Loading } from "./loading";

export const LinuxDesktop: FC = () => {
  const { sandbox } = useSnapshot(store);
  const { vncUrl: iframeUrl } = useVncUrl(sandbox?.SandboxId);

  if (!iframeUrl) {
    return <Loading />;
  }

  return (
    <iframe
      src={iframeUrl}
      className="w-full h-full border-0"
      title="远程桌面"
      sandbox="allow-same-origin allow-scripts"
      onError={(e) => {
        // 在iframe加载失败时显示备用内容
        const target = e.target as HTMLIFrameElement;
        if (target && target.contentDocument) {
          target.contentDocument.body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;background:#f8fafc;">
                  <div style="font-size:72px;margin-bottom:20px;">🖥️</div>
                  <h2 style="font-size:24px;color:#334155;margin-bottom:16px;">远程桌面已就绪</h2>
                  <p style="color:#64748b;font-size:14px;">沙箱 ID: ${sandbox?.SandboxId}</p>
                </div>
              `;
        }
      }}
    />
  );
};
