import { useVncUrl } from "@/hooks/use-vnc-url";
import React, { FC } from "react";
import { useSnapshot } from "valtio";
import store from "@/store";
import { Loading } from "./loading";

export const WindowsDesktop: FC = () => {
  const { sandbox, id } = useSnapshot(store);
  const { password, wsUrl } = useVncUrl(sandbox?.SandboxId);

  if (!password || !wsUrl) {
    return <Loading />;
  }

  const iframeUrl = `/guac/index.html?url=${wsUrl}&instanceId=${id}&ip=${
    sandbox?.PrimaryIp || sandbox?.Eip
  }&password=${encodeURIComponent(password)}`;

  return (
    <iframe
      id="guac-iframe"
      src={iframeUrl}
      className="w-full h-full min-h-[1px] border-0"
      sandbox="allow-same-origin allow-scripts"
      allow="keyboard-map"
    />
  );
};
