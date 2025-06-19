declare interface Window {
  __DEMO_HOUSE_VAR: any; // 替换为更具体的类型定义
}

interface VmokBaseProps {
  config?: any; // 运营平台下发的配置
  url?: string;
  urlPrefix?: string;
  getHeader?: () => Record<string, Record<string, string>>;
  auth?: {
    accountId?: string;
    userId?: string;
  };
  api?: any;
}
