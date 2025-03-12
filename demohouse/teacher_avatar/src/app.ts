import { defineApp } from '@ai-app/agent';

export default defineApp({
  aiMeta: {
    /**
     * 应用名，建议 3-10 个字符
     */
    name: '教师分身',
    /**
     * 应用的描述，建议 10-15 个字符
     */
    description: 'AI Applet Demo',
    /**
     * 应用包名，需要保持唯一
     */
    package: 'com.volcengine.snap_solver',
    /**
     * 应用的图标地址
     *
     * 建议：选择你合适的图表，上传至 CDN：https://cloud.bytedance.net/deliver?x-resource-account=public
     */
    icons:
      'https://lf0-fast-deliver-inner.bytedance.net/obj/eden-internal/psvhouloj/ai-applet/ai_memorize_words.png',
    /**
     * 目前 Native Playground “暂时” 基于 keywords 进行分类
     *
     *   - keywords 中包含 "Native" 的才能在 Native Playground 上展示；
     *   - keywords 中包含 "AIApp" 展示在 “应用” 范畴；
     *   - keywords 中包含 "AIFeature" 展示在 “能力” 范畴；
     */
    keywords: ['Native', 'AIApp'],
    /**
     * 设置欢迎语（Opening Dialog）
     *
     * @see https://bytedance.larkoffice.com/wiki/GJ3UwmlPziaa86kffZUcoKf6npZ
     */
    openingDialog: {
      text: '你好，我是你的背单词助手，我可以帮助你提升英语词汇',
      questions: ['我要背单词', '陌生词汇复习', '我认识多少单词？']
    },
    /**
     * 当前，在豆包 App 中运行需要配置 BotId
     */
    botId: ''
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
