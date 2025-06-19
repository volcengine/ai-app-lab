import { appTools, defineConfig } from '@modern-js/app-tools';
import { tailwindcssPlugin } from '@modern-js/plugin-tailwindcss';
import * as tailwindConfig from './tailwind.config';

// https://modernjs.dev/en/configure/app/usage
export default defineConfig({
  runtime: {
    router: true,
  },
  tools: {
    tailwindcss: tailwindConfig,
  },
  source: {
    globalVars: {
      'process.env.VOLC_ACCESSKEY': process.env.VOLC_ACCESSKEY,
      'process.env.VOLC_SECRETKEY': process.env.VOLC_SECRETKEY,
      'process.env.ARK_API_KEY': process.env.ARK_API_KEY,
    },
  },
  plugins: [
    appTools({
      bundler: 'rspack', // Set to 'webpack' to enable webpack
    }),
    tailwindcssPlugin(),
  ],
});
