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
import * as tailwindConfig from './tailwind.config';
import { tailwindcssPlugin } from '@modern-js/plugin-tailwindcss';

// https://modernjs.dev/en/configure/app/usage
export default defineConfig({
  runtime: {
    router: true,
  },
  tools: {
    tailwindcss: tailwindConfig,
    devServer: {
      proxy: {
        ['/api/v3/contents/generations/tasks']: {
          target: 'https://ark.cn-beijing.volces.com',
          changeOrigin: true,
        },
      }
    }
  },
  source: {
    globalVars: {
      'process.env.VOLC_ACCESSKEY': process.env.VOLC_ACCESSKEY,
      'process.env.VOLC_SECRETKEY': process.env.VOLC_SECRETKEY,
      'process.env.ARK_API_KEY': process.env.ARK_API_KEY,
    }
  },
  plugins: [
    appTools({
      bundler: 'rspack', // Set to 'webpack' to enable webpack
    }),
    tailwindcssPlugin(),
  ],
});
