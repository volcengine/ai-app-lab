import type { Metadata } from "next";
import { ClientBody } from "../components/client-body";
import { EnvProvider } from "../components/env-provider";

import "./index.css";
import "@arco-design/web-react/dist/css/arco.css";

export const metadata: Metadata = {
  title: "Computer Use Agent",
  description: "Computer Use Agent",
  icons: {
    icon: "/images/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <EnvProvider />
      </head>
      <ClientBody>{children}</ClientBody>
    </html>
  );
}
