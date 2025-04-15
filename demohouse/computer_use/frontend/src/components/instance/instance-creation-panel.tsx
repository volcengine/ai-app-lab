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

import { OSType } from "@/services/sandbox";
import { useState } from "react";
import store from "@/store";
import { FC } from "react";
import { useSnapshot } from "valtio";
import { OsTypeLogo } from "../os-type-logo";
import { Button } from "@arco-design/web-react";
import { IconArrowRight } from "@arco-design/web-react/icon";

export const InstanceCreationPanel: FC<{
  onCreateInstance: (osType: OSType) => void;
}> = ({ onCreateInstance }) => {
  const { creating } = useSnapshot(store);
  const [selectedOs, setSelectedOs] = useState<OSType>(OSType.LINUX);
  return (
    <div className="text-center w-full">
      <div className="flex flex-col gap-4">
        <div className="text-center mb-6">
          <p className="text-sm text-slate-600">
            选择您需要的操作系统类型并启动沙箱
          </p>
        </div>
        <div className="relative w-16 h-16 mb-5 mx-auto">
          <OsTypeLogo osType={selectedOs} size="large" />
        </div>
        <div className="flex gap-3 justify-center mb-5">
          {[OSType.LINUX, OSType.WINDOWS].map((os) => (
            <Button
              key={os}
              className="w-[100px]"
              type={selectedOs === os ? "primary" : "outline"}
              onClick={() => setSelectedOs(os)}
            >
              {os}
            </Button>
          ))}
        </div>
      </div>

      <Button
        type="primary"
        className="w-full mt-5"
        onClick={() => {
          onCreateInstance(selectedOs);
        }}
        disabled={creating}
      >
        <IconArrowRight className="mr-2" />
        {creating ? "启动中..." : "启动沙箱"}
      </Button>
    </div>
  );
};
