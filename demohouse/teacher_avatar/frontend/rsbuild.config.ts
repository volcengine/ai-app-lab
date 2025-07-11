import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginLess } from '@rsbuild/plugin-less';

export default defineConfig({
  plugins: [pluginReact(), pluginLess()],
  html: {
    template: './src/index.html',
    inject: 'body',
    scriptLoading: 'blocking'
  },
  output: {
    assetPrefix: 'auto',
    inlineScripts: true,
    inlineStyles: true
  },
  source: {
    define: {
      "process.env.VLM_MODEL": JSON.stringify(process.env.VLM_MODEL),
      "process.env.TEACHER_MODEL": JSON.stringify(process.env.TEACHER_MODEL),
      "process.env.TEACHER_APIKEY": JSON.stringify(process.env.TEACHER_APIKEY),
      "process.env.DEEP_SEEK_MODEL": JSON.stringify(process.env.DEEP_SEEK_MODEL),
    }
  }
});
