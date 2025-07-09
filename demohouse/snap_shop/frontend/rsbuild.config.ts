import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact(), pluginLess()],
  html: {
    title: 'Multi modal SDK example',
    inject: 'body',
    scriptLoading: 'blocking',
  },
  output: {
    inlineScripts: true,
    inlineStyles: true,
  },
  source: {
    define: {
      "process.env.MODEL": JSON.stringify(process.env.MODEL),
      "process.env.API_KEY": JSON.stringify(process.env.API_KEY),
    }
  }
});
