import store from "@/store";
import { FC } from "react";
import { useSnapshot } from "valtio";

export const LinuxDesktop: FC<{ iframeUrl: string }> = ({ iframeUrl }) => {
  const { sandbox } = useSnapshot(store);
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
                  <p style="color:#64748b;font-size:14px;">实例 ID: ${sandbox?.SandboxId}</p>
                </div>
              `;
        }
      }}
    />
  );
};
