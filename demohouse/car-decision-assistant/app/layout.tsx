import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "购车决策助手｜按真实需求核验候选车型",
    description:
      "保存你的个人条件、精确车型、试驾结果、报价和销售承诺，随时看清下订前还有什么没有确认。",
    openGraph: {
      title: "购车决策助手",
      description: "下订前，先把关键条件确认清楚。",
      url: origin,
      type: "website",
      locale: "zh_CN",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "购车决策助手：按真实需求核验候选车型",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "购车决策助手",
      description: "下订前，先把关键条件确认清楚。",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
