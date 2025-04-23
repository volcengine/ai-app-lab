import { Alert } from "@arco-design/web-react";
import { FC } from "react";

export const RemainingTimeAlert: FC = () => {
  return (
    <Alert
      type="info"
      content="远程桌面实例有 30分钟 使用限制，请合理安排使用时间"
    />
  );
};
