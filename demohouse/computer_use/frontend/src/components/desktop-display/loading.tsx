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

import { FC } from "react";
import { Spinner } from "../spinner";
import store from "@/store";
import { useSnapshot } from "valtio";

export const Loading: FC = () => {
  const { sandbox } = useSnapshot(store);
  return (
    <div className="h-full flex-1 border-0 shadow-sm bg-white rounded-md flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <Spinner />

          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            正在启动您的远程沙箱
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            这可能需要1-2分钟的时间，请耐心等待
          </p>

          <div className="w-64 mx-auto bg-slate-200 rounded-full h-2.5 mb-4">
            <div
              className="h-2.5 rounded-full animate-[loading_2s_ease-in-out_infinite]"
              style={{
                background: "rgb(var(--primary-6))",
              }}
            ></div>
          </div>

          <p className="text-xs text-slate-500">
            正在配置
            {sandbox?.OsType}
            环境...
          </p>
        </div>
      </div>
    </div>
  );
};
