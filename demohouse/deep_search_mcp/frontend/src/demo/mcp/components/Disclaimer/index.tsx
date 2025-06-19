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

import { Link } from '@arco-design/web-react';

const linkStyle =
  'text-xs text-[color:var(--color-text-3)] transition ease-in-out duration-300';

const Disclaimer = () => (
  <div className="w-full text-[color:var(--color-text-3)] flex items-center justify-center text-xs leading-5">
    <div className="flex items-center justify-center flex-wrap">
      <span className="flex-shrink-0">
        {'试用体验内容均由人工智能模型生成，不代表平台立场'}
      </span>
      <div className="pl-4 grid grid-cols-3 gap-x-1 flex-shrink-0">
        <Link
          className={linkStyle}
          href="https://www.volcengine.com/docs/82379/1108564"
          target="_blank"
        >
          {'免责声明'}
        </Link>
        <Link
          className={linkStyle}
          href="https://www.volcengine.com/docs/6256/79748"
          target="_blank"
        >
          {'测试协议'}
        </Link>
        <Link
          className={linkStyle}
          href="https://www.volcengine.com/docs/6256/64902"
          target="_blank"
        >
          {'隐私政策'}
        </Link>
      </div>
    </div>
  </div>
);

export default Disclaimer;
