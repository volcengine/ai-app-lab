/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react";
import { Button } from "@arco-design/web-react";

interface HeaderProps {
  title: string;
  subtitle: string;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle }) => (
  <div className="flex justify-between items-center px-8 py-4 border-b border-solid border-gray-200">
    <div className="flex items-baseline">
      <div className="relative top-1 w-6 h-6 rounded bg-[url('./assets/logo.png')] bg-center bg-cover bg-no-repeat"></div>
      <div className="pl-2 text-lg">{title}</div>
      <div className="pl-2 text-sm text-gray-500 item-b">{subtitle}</div>
    </div>
    <Button
      type="primary"
      onClick={() => window.open("https://console.volcengine.com/ark")}
    >
      访问控制台
    </Button>
  </div>
);

export default Header;
