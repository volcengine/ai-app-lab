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
        APP_ID: argObj.APP_ID,
        ACCESS_TOKEN: argObj.ACCESS_TOKEN,
        FAAS_URL: argObj.FAAS_URL,
      },
    },
  },
  output: {
    disableTsChecker: true,
  },
  tools: {
    devServer: {
      proxy: {
        '/api': {
          changeOrigin: true,
          target: argObj.FAAS_URL,
          onProxyRes: (proxyRes, req, res) => {
            const target =
              'https://scssbl15u19f8v2ksh2ig.apigateway-cn-beijing.volceapi.com';
            proxyRes.headers['x-real-url'] = target + req.url;
            console.log('devServer proxy', proxyRes.headers, res);
          },
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