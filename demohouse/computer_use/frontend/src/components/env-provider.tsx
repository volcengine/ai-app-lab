"use server";

import { FC } from "react";

export const EnvProvider: FC = async () => {
  // 在服务端获取环境变量
  const envVars = {};

  // 将环境变量作为 data 属性注入到 script 标签中
  return (
    <script
      id="env-data"
      type="application/json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(envVars),
      }}
    />
  );
};
