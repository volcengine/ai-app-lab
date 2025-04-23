import React, { FC } from "react";

interface WindowsDesktopProps {
  instanceId: string;
  ip: string;
  password: string;
  url: string;
}

export const WindowsDesktop: FC<WindowsDesktopProps> = ({
  url,
  instanceId,
  ip,
  password,
}) => {
  const iframeUrl = `/guac/index.html?url=${url}&instanceId=${instanceId}&ip=${ip}&password=${encodeURIComponent(
    password
  )}`;

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
