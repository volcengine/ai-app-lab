import { appTools, defineConfig } from '@modern-js/app-tools';
import {tailwindcssPlugin} from "@modern-js/plugin-tailwindcss";

// https://modernjs.dev/en/configure/app/usage
export default defineConfig({
  source: {
    alias: {
      '@': './src',
    },
  },
  runtime: {
    router: true,
  },
  plugins: [
    tailwindcssPlugin(),
    appTools({
      bundler: 'rspack', // Set to 'webpack' to enable webpack
    }),
  ],
  tools:{
    devServer:{
      proxy:{
        '/memory_api':{
          changeOrigin: true,
          pathRewrite: { '^/memory_api': '' },
          target: 'http://0.0.0.0:8888/api/v3/bots/chat/completions',
        }
      }
    }
  }
});
