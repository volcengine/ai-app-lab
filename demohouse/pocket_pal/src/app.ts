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
