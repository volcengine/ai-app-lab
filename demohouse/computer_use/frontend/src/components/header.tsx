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

"use client";

import Link from "next/link";
import { FC } from "react";
import { IconQuestionCircle } from "@arco-design/web-react/icon";

export const Header: FC = () => {
  return (
    <header className="bg-white shadow-[0px_2px_6px_0px_#00000014] h-12 sticky top-0 z-50">
      <div className="flex h-full items-center px-4 justify-between">
        <div className="flex items-center">
          <Link
            href="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <img alt="Logo" src="/images/logo.png" className="h-6 w-6 inline" />
            <span className="font-[Roboto] font-medium text-base leading-6 tracking-[0.3%] text-[#0C0D0E]">
              Computer Use Agent
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-6">
          <IconQuestionCircle className="text-[#42464E]" />
          <img
            src="images/avatar.png"
            className="h-6 w-6 mr-2 inline rounded-full border border-indigo-600/30"
          />
        </div>
      </div>
    </header>
  );
};
