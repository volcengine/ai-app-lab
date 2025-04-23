import type { Metadata } from "next";

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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
