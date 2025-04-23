import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // 改掉 strict mode ，否则在开发模式，Message 在 hook 模式下，第一次消息会触发两次
  reactStrictMode: false,
};

export default nextConfig;
