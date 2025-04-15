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
