// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License. 

import { appTools, defineConfig } from '@modern-js/app-tools';
import { tailwindcssPlugin } from '@modern-js/plugin-tailwindcss';

const argObj = {} as Record<string, string>;

process.argv.forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    argObj[key] = value;
  }
});

// https://modernjs.dev/en/configure/app/usage
export default defineConfig({
  source: {
    globalVars: {
      APP_CONTEXT: {
        ASR_APP_ID: argObj.ASR_APP_ID,
        ASR_ACCESS_TOKEN: argObj.ASR_ACCESS_TOKEN,
        FAAS_URL: argObj.FAAS_URL,
      },
    },
  },
  output: {
    disableTsChecker: true,
  },
  dev: {
    https: true,
    host: '0.0.0.0', // 允许局域网访问
  },
  tools: {
    devServer: {
      proxy: {
        '/api': {
          changeOrigin: true,
          target: argObj.FAAS_URL,
        },
      },
    },
  },
  runtime: {
    router: {
      basename: '/',
    },
  },
  plugins: [
    appTools({
      bundler: 'rspack', // Set to 'webpack' to enable webpack
    }),
    tailwindcssPlugin(),
  ],
});
