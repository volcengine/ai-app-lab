"use client";

import { FC, useEffect } from "react";
import { actions, store } from "@/store";
import { useSnapshot } from "valtio";
import { Login } from "./login";
export const ClientBody: FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  useEffect(() => {
    // 从注入的脚本标签中读取环境变量
    const envScript = document.getElementById("env-data");
    if (envScript) {
      try {
        const envVars = JSON.parse(envScript.textContent || "{}");
        // 更新全局状态
        actions.setEnv(envVars);
      } catch (error) {
        console.error("获取环境变量失败", error);
      }
    }

    // 移除任何扩展添加的类
    document.body.className = "antialiased";
  }, []);

  const { loggedIn } = useSnapshot(store);

  return (
    <body className="antialiased" suppressHydrationWarning>
      {loggedIn ? children : <Login />}
    </body>
  );
};
