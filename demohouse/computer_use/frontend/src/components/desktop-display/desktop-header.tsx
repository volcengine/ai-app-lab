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

import { actions, store } from "@/store";
import { useSnapshot } from "valtio";
import { OsTypeLogo } from "../os-type-logo";
import { FC } from "react";

export const WindowHeader: FC = () => {
  const { sandbox } = useSnapshot(store);
  return (
    <div className="flex items-center justify-between bg-white px-3 py-2 border-b border-slate-200">
      <div className="flex items-center space-x-1.5">
        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
        <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
        <div
          className="w-3 h-3 bg-green-500 rounded-full cursor-pointer"
          onClick={() => actions.toggleMaximized()}
        ></div>
      </div>
      <div className="text-xs flex gap-2 font-medium text-slate-600">
        <OsTypeLogo osType={sandbox?.OsType} />
        远程桌面 - {sandbox?.PrimaryIp || sandbox?.Eip || sandbox?.SandboxId}
      </div>
      <div className="w-16"></div>
    </div>
  );
};
