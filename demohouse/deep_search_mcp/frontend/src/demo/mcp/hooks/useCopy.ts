import { Message } from '@arco-design/web-react';

export const useCopy = (text: string) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      Message.success('复制成功');
    } catch (error) {
      Message.error('复制失败');
    }
  };

  return {
    copy,
  };
};
