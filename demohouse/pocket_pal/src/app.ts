import { defineApp } from '@ai-app/agent';

export default defineApp({
  aiMeta: {
    name: '手机助手',
    description: 'Volcengine Demo',
    package: 'com.volcengine.copilot',
  },
  // Watch life cycle
  onLaunch() {
    console.log('[App LifeCycle] App launched');
  },

  onPageOpened({ viewId }: { viewId: string }) {
    console.log(`[App LifeCycle] On page opened: ${JSON.stringify(viewId)}`);
  },

  onForeground() {
    console.log('[App LifeCycle] On foreground');
  },

  onBackground() {
    console.log('[App LifeCycle] On background');
  },

  onDestroy() {
    console.log('[App LifeCycle] On destroyed');
  }
});
