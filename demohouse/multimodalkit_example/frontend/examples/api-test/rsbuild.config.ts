import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const isSingleFile = process.env.BUILD_TYPE === 'inlined';

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: 'Multi modal SDK API test',
    ...(isSingleFile
      ? {
          inject: 'body',
          scriptLoading: 'blocking',
        }
      : undefined),
  },
  output: isSingleFile
    ? {
        inlineScripts: true,
        inlineStyles: true,
      }
    : undefined,
});
